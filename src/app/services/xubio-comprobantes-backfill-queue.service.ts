import {
  Injectable,
  Logger,
  OnModuleDestroy,
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
import { XubioComprobantesBackfillService } from './xubio-comprobantes-backfill.service';

export const XUBIO_COMPROBANTES_BACKFILL_QUEUE_NAME =
  'xubio-comprobantes-backfill';
const XUBIO_COMPROBANTES_BACKFILL_JOB_NAME = 'historical-backfill';
const DEFAULT_QUEUE_READY_TIMEOUT_MS = 10_000;

interface XubioComprobantesBackfillJobData {
  syncRunId: number;
  command: NormalizedBackfillXubioComprobantesCommand;
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
export class XubioComprobantesBackfillQueueService implements OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async processBackfillJob(
    job: Job<XubioComprobantesBackfillJobData>,
  ): Promise<XubioComprobantesBackfillJobResult> {
    this.logger.log(
      `Xubio comprobantes backfill job started ${JSON.stringify({
        jobId: job.id,
        syncRunId: job.data.syncRunId,
        fechaDesde: job.data.command.fechaDesde,
        fechaHasta: job.data.command.fechaHasta,
        xubioLimit: job.data.command.xubioLimit,
      })}`,
    );

    const result = await this.backfillService.execute({
      ...job.data.command,
      syncRunId: job.data.syncRunId,
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
