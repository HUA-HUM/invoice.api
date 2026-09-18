import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker, type JobsOptions } from 'bullmq';
import type {
  BackfillXubioComprobantesCommand,
  BackfillXubioComprobantesResponse,
  NormalizedBackfillXubioComprobantesCommand,
} from '../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import {
  readErrorMessage,
  waitUntilQueueReady,
} from '../drivers/queue/wait-until-queue-ready';
import { RedisConnectionOptionsFactory } from '../drivers/redis/redis-connection-options.factory';
import {
  XubioComprobantesBackfillService,
  type CreatedXubioComprobantesBackfillSyncRun,
} from './xubio-comprobantes-backfill.service';

export const XUBIO_COMPROBANTES_BACKFILL_QUEUE_NAME =
  'xubio-comprobantes-backfill';
const XUBIO_COMPROBANTES_BACKFILL_JOB_NAME = 'historical-backfill';
const XUBIO_COMPROBANTES_BACKFILL_SCHEDULED_JOB_NAME = 'scheduled-backfill';
export const XUBIO_COMPROBANTES_BACKFILL_SCHEDULER_ID =
  'xubio-comprobantes-backfill-recurrente';
const DEFAULT_QUEUE_READY_TIMEOUT_MS = 10_000;
// Every two hours. Madre feeds the duplicate guard: while it is stale the bot
// cannot tell an already-invoiced TLQV from a new one.
const DEFAULT_SCHEDULE_CRON = '0 */2 * * *';
const DEFAULT_SCHEDULE_TIME_ZONE = 'America/Argentina/Buenos_Aires';
// Re-reads a window that overlaps what the previous runs already covered, so
// a missed run or a comprobante loaded late does not leave a hole.
const DEFAULT_SCHEDULE_LOOKBACK_DAYS = 7;
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1_000;

interface XubioComprobantesBackfillJobData {
  /** Absent on scheduled runs: the sync run is opened when the job starts. */
  syncRunId?: number;
  command?: NormalizedBackfillXubioComprobantesCommand;
  /** Present only on the jobs the scheduler produces. */
  scheduled?: {
    lookbackDays: number;
  };
}

interface XubioComprobantesBackfillJobResult {
  syncRunId: number;
  status: BackfillXubioComprobantesResponse['status'];
  totalListed: number;
  totalDetailRequests: number;
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
}

export interface EnqueueXubioComprobantesBackfillResponse {
  syncRunId: number;
  jobId: string;
  queueName: string;
  status: 'queued';
  fechaDesde: string;
  fechaHasta: string;
  batchSize: number;
  windowSizeDays: number;
  xubioLimit: number;
}

@Injectable()
export class XubioComprobantesBackfillQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    XubioComprobantesBackfillQueueService.name,
  );
  private readonly queue: Queue<XubioComprobantesBackfillJobData>;
  private readonly worker: Worker<
    XubioComprobantesBackfillJobData,
    XubioComprobantesBackfillJobResult
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly backfillService: XubioComprobantesBackfillService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    const connection = this.redisConnectionOptionsFactory.build();
    const defaultJobOptions = this.buildDefaultJobOptions();

    this.queue = new Queue<XubioComprobantesBackfillJobData>(
      XUBIO_COMPROBANTES_BACKFILL_QUEUE_NAME,
      {
        connection,
        defaultJobOptions,
      },
    );
    this.worker = new Worker<
      XubioComprobantesBackfillJobData,
      XubioComprobantesBackfillJobResult
    >(
      XUBIO_COMPROBANTES_BACKFILL_QUEUE_NAME,
      (job) => this.processBackfillJob(job),
      {
        connection,
        concurrency: this.readNumberConfig(
          'XUBIO_COMPROBANTES_QUEUE_CONCURRENCY',
          1,
        ),
      },
    );

    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `Xubio comprobantes backfill job completed ${JSON.stringify({
          jobId: job.id,
          syncRunId: result.syncRunId,
          status: result.status,
          totalListed: result.totalListed,
          totalInserted: result.totalInserted,
          totalUpdated: result.totalUpdated,
          totalFailed: result.totalFailed,
        })}`,
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Xubio comprobantes backfill job failed ${JSON.stringify({
          jobId: job?.id,
          syncRunId: job?.data.syncRunId,
          errorMessage: error.message,
        })}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(
        `Xubio comprobantes backfill worker error ${JSON.stringify({
          errorMessage: error.message,
        })}`,
      );
    });
  }

  getQueue(): Queue<XubioComprobantesBackfillJobData> {
    return this.queue;
  }

  async enqueue(
    command: BackfillXubioComprobantesCommand,
  ): Promise<EnqueueXubioComprobantesBackfillResponse> {
    await this.waitUntilQueueReady();

    const syncRun = await this.backfillService.createSyncRun(command);
    const jobId = buildBackfillJobId(syncRun.syncRunId);
    let job: Job<XubioComprobantesBackfillJobData>;

    try {
      job = await this.queue.add(
        XUBIO_COMPROBANTES_BACKFILL_JOB_NAME,
        {
          syncRunId: syncRun.syncRunId,
          command: syncRun.command,
        },
        {
          jobId,
        },
      );
    } catch (error: unknown) {
      await this.backfillService.failSyncRun(
        syncRun.syncRunId,
        error instanceof Error ? error.message : 'Unknown queue error',
      );
      throw error;
    }

    this.logger.log(
      `Xubio comprobantes backfill job queued ${JSON.stringify({
        jobId: job.id,
        syncRunId: syncRun.syncRunId,
        fechaDesde: syncRun.command.fechaDesde,
        fechaHasta: syncRun.command.fechaHasta,
      })}`,
    );

    return {
      syncRunId: syncRun.syncRunId,
      jobId: String(job.id),
      queueName: XUBIO_COMPROBANTES_BACKFILL_QUEUE_NAME,
      status: 'queued',
      fechaDesde: syncRun.command.fechaDesde,
      fechaHasta: syncRun.command.fechaHasta,
      batchSize: syncRun.command.batchSize,
      windowSizeDays: syncRun.command.windowSizeDays,
      xubioLimit: syncRun.command.xubioLimit,
    };
  }

  /**
   * Registers the recurring backfill. The schedule lives in Redis, so several
   * instances of the API agree on a single run instead of each firing its own.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.syncScheduler();
    } catch (error: unknown) {
      // A boot with Redis down must not take the API down with it; the next
      // boot registers the schedule.
      this.logger.error(
        `Could not register the Xubio comprobantes backfill schedule ${JSON.stringify(
          { errorMessage: readErrorMessage(error) },
        )}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async syncScheduler(): Promise<void> {
    if (
      !this.readBooleanConfig('XUBIO_COMPROBANTES_BACKFILL_CRON_ENABLED', true)
    ) {
      // Removing it matters: without this, turning the flag off would leave
      // the schedule already stored in Redis firing forever.
      const removed = await this.queue.removeJobScheduler(
        XUBIO_COMPROBANTES_BACKFILL_SCHEDULER_ID,
      );
      if (removed) {
        this.logger.warn('Xubio comprobantes backfill schedule removed');
      }
      return;
    }

    const pattern = this.readStringConfig(
      'XUBIO_COMPROBANTES_BACKFILL_CRON',
      DEFAULT_SCHEDULE_CRON,
    );
    const tz = this.readStringConfig(
      'XUBIO_COMPROBANTES_BACKFILL_CRON_TZ',
      DEFAULT_SCHEDULE_TIME_ZONE,
    );
    const lookbackDays = this.readPositiveNumberConfig(
      'XUBIO_COMPROBANTES_BACKFILL_CRON_LOOKBACK_DAYS',
      DEFAULT_SCHEDULE_LOOKBACK_DAYS,
    );

    await this.queue.upsertJobScheduler(
      XUBIO_COMPROBANTES_BACKFILL_SCHEDULER_ID,
      { pattern, tz },
      {
        name: XUBIO_COMPROBANTES_BACKFILL_SCHEDULED_JOB_NAME,
        data: { scheduled: { lookbackDays } },
      },
    );

    this.logger.log(
      `Xubio comprobantes backfill schedule registered ${JSON.stringify({
        pattern,
        tz,
        lookbackDays,
      })}`,
    );
  }

  private async processBackfillJob(
    job: Job<XubioComprobantesBackfillJobData>,
  ): Promise<XubioComprobantesBackfillJobResult> {
    const run = await this.resolveJobRun(job);

    this.logger.log(
      `Xubio comprobantes backfill job started ${JSON.stringify({
        jobId: job.id,
        syncRunId: run.syncRunId,
        scheduled: job.data.scheduled !== undefined,
        fechaDesde: run.command.fechaDesde,
        fechaHasta: run.command.fechaHasta,
        xubioLimit: run.command.xubioLimit,
      })}`,
    );

    const result = await this.backfillService.execute({
      ...run.command,
      syncRunId: run.syncRunId,
    });

    return {
      syncRunId: result.syncRunId,
      status: result.status,
      totalListed: result.totalListed,
      totalDetailRequests: result.totalDetailRequests,
      totalInserted: result.totalInserted,
      totalUpdated: result.totalUpdated,
      totalFailed: result.totalFailed,
    };
  }

  /**
   * A job enqueued through the endpoint already carries its sync run. A
   * scheduled one cannot: the scheduler stores a fixed template, so the window
   * is computed and the sync run opened when the job actually starts.
   */
  private async resolveJobRun(
    job: Job<XubioComprobantesBackfillJobData>,
  ): Promise<CreatedXubioComprobantesBackfillSyncRun> {
    const { syncRunId, command, scheduled } = job.data;
    if (syncRunId !== undefined && command !== undefined) {
      return { syncRunId, command };
    }

    if (scheduled === undefined) {
      throw new Error(
        `Xubio comprobantes backfill job ${String(job.id)} has neither a sync run nor a schedule`,
      );
    }

    const run = await this.backfillService.createSyncRun(
      buildScheduledBackfillWindow(scheduled.lookbackDays, new Date()),
    );

    // Written back so a retry of this same job reuses the sync run instead of
    // opening a new one and leaving the previous one hanging as `running`.
    await job.updateData({
      ...job.data,
      syncRunId: run.syncRunId,
      command: run.command,
    });

    return run;
  }

  private buildDefaultJobOptions(): JobsOptions {
    return {
      attempts: this.readNumberConfig('XUBIO_COMPROBANTES_QUEUE_ATTEMPTS', 3),
      backoff: {
        type: 'fixed',
        delay: this.readNumberConfig(
          'XUBIO_COMPROBANTES_QUEUE_RETRY_DELAY_MS',
          30_000,
        ),
      },
      removeOnComplete: {
        count: this.readNumberConfig(
          'XUBIO_COMPROBANTES_QUEUE_REMOVE_COMPLETE_COUNT',
          1_000,
        ),
      },
      removeOnFail: {
        count: this.readNumberConfig(
          'XUBIO_COMPROBANTES_QUEUE_REMOVE_FAIL_COUNT',
          1_000,
        ),
      },
    };
  }

  private async waitUntilQueueReady(): Promise<void> {
    try {
      await waitUntilQueueReady(
        this.queue,
        this.readNumberConfig(
          'XUBIO_COMPROBANTES_QUEUE_READY_TIMEOUT_MS',
          DEFAULT_QUEUE_READY_TIMEOUT_MS,
        ),
      );
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `Xubio comprobantes backfill queue is not ready. ${readErrorMessage(
          error,
        )}`,
      );
    }
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }

  private readNumberConfig(name: string, defaultValue: number): number {
    const rawValue = this.readOptionalConfig(name);
    if (rawValue === undefined) {
      return defaultValue;
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a positive integer`);
    }

    return value;
  }

  private readStringConfig(name: string, defaultValue: string): string {
    return this.readOptionalConfig(name) ?? defaultValue;
  }

  private readPositiveNumberConfig(name: string, defaultValue: number): number {
    const value = this.readNumberConfig(name, defaultValue);
    if (value < 1) {
      throw new Error(`${name} must be greater than zero`);
    }

    return value;
  }

  private readBooleanConfig(name: string, defaultValue: boolean): boolean {
    const rawValue = this.readOptionalConfig(name);
    if (rawValue === undefined) {
      return defaultValue;
    }

    return ['1', 'true', 'yes', 'y'].includes(rawValue.toLowerCase());
  }
}

function buildBackfillJobId(syncRunId: number): string {
  return `sync-run-${syncRunId}`;
}

/**
 * The recurring run does not re-read the whole history: it covers the last
 * `lookbackDays` days, which overlaps what earlier runs already brought in.
 */
export function buildScheduledBackfillWindow(
  lookbackDays: number,
  now: Date,
): { fechaDesde: string; fechaHasta: string } {
  return {
    fechaDesde: formatDate(
      new Date(now.getTime() - lookbackDays * MILLISECONDS_IN_A_DAY),
    ),
    fechaHasta: formatDate(now),
  };
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
