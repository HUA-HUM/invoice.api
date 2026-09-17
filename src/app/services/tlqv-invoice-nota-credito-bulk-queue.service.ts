import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Job, Queue, Worker, type JobsOptions } from 'bullmq';
import type {
  CreateNotaCreditoFromTlqvResponse,
  CreateNotaCreditoStatus,
} from '../../core/interactors/tlqv-invoice/facturas/CreateNotaCreditoFromTlqvInteractor';
import {
  readErrorMessage,
  waitUntilQueueReady,
} from '../drivers/queue/wait-until-queue-ready';
import { RedisConnectionOptionsFactory } from '../drivers/redis/redis-connection-options.factory';
import { InvoiceClientIssueRecorderService } from './invoice-client-issue-recorder.service';
import { TlqvInvoiceFacturasService } from './tlqv-invoice-facturas.service';

export const TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_NAME =
  'tlqv-invoice-nota-credito-bulk';
const TLQV_INVOICE_NOTA_CREDITO_BULK_JOB_NAME = 'nota-credito-from-tlqv';
const DEFAULT_QUEUE_READY_TIMEOUT_MS = 10_000;
const DEFAULT_ADD_CHUNK_SIZE = 500;

export interface TlqvInvoiceNotaCreditoBulkJobData {
  batchId: string;
  tlqvCode: string;
  dryRun: boolean;
  issueDate?: string;
  requestedAt: string;
}

export interface TlqvInvoiceNotaCreditoBulkJobResult {
  batchId: string;
  tlqvCode: string;
  status: CreateNotaCreditoStatus;
  created: boolean;
  blockerCodes: string[];
  cancelledNumeroDocumento?: string | null;
  notaCreditoNumeroDocumento?: string | null;
  notaCreditoCae?: string | null;
  /** False until the CAE is requested by hand in Xubio. */
  fiscalmenteEmitido?: boolean;
}

export interface EnqueueTlqvInvoiceNotaCreditoBulkCommand {
  tlqvCodes: string[];
  dryRun?: boolean;
  issueDate?: string;
}

export type TlqvInvoiceNotaCreditoBulkJobState =
  'completed' | 'failed' | 'active' | 'waiting' | 'delayed' | 'paused';

@Injectable()
export class TlqvInvoiceNotaCreditoBulkQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(
    TlqvInvoiceNotaCreditoBulkQueueService.name,
  );
  private readonly queue: Queue<TlqvInvoiceNotaCreditoBulkJobData>;
  private readonly worker: Worker<
    TlqvInvoiceNotaCreditoBulkJobData,
    TlqvInvoiceNotaCreditoBulkJobResult
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly tlqvInvoiceFacturasService: TlqvInvoiceFacturasService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
    private readonly invoiceClientIssueRecorder: InvoiceClientIssueRecorderService,
  ) {
    const connection = this.redisConnectionOptionsFactory.build();

    this.queue = new Queue<TlqvInvoiceNotaCreditoBulkJobData>(
      TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: this.buildDefaultJobOptions(),
      },
    );
    this.worker = new Worker<
      TlqvInvoiceNotaCreditoBulkJobData,
      TlqvInvoiceNotaCreditoBulkJobResult
    >(
      TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_NAME,
      (job) => this.processJob(job),
      {
        connection,
        // Deliberately serial by default: every job that is not a dry run
        // issues a comprobante with a CAE, and one at a time keeps the
        // numbering readable if something has to be reviewed afterwards.
        concurrency: this.readConcurrency(),
      },
    );

    this.registerWorkerLogging();
  }

  getQueue(): Queue<TlqvInvoiceNotaCreditoBulkJobData> {
    return this.queue;
  }

  async enqueueBulk(command: EnqueueTlqvInvoiceNotaCreditoBulkCommand) {
    await this.waitUntilQueueReady();

    const normalized = normalizeUniqueTlqvCodes(command.tlqvCodes);
    const batchId = buildBatchId();
    const dryRun = command.dryRun ?? true;
    const requestedAt = new Date().toISOString();

    const jobs = normalized.unique.map((tlqvCode) => ({
      name: TLQV_INVOICE_NOTA_CREDITO_BULK_JOB_NAME,
      data: {
        batchId,
        tlqvCode,
        dryRun,
        issueDate: command.issueDate,
        requestedAt,
      },
      opts: {
        // Deterministic per batch: re-sending the same batch cannot enqueue a
        // TLQV twice.
        jobId: buildJobId(batchId, tlqvCode),
      },
    }));

    const queuedJobs: Job<TlqvInvoiceNotaCreditoBulkJobData>[] = [];
    const addChunkSize = this.readPositiveIntegerConfig(
      'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_ADD_CHUNK_SIZE',
      DEFAULT_ADD_CHUNK_SIZE,
    );
    for (let index = 0; index < jobs.length; index += addChunkSize) {
      const created = await this.queue.addBulk(
        jobs.slice(index, index + addChunkSize),
      );
      queuedJobs.push(...created);
    }

    this.logger.log(
      `TLQV invoice nota credito bulk queued ${JSON.stringify({
        batchId,
        totalUnique: normalized.unique.length,
        totalQueued: queuedJobs.length,
        dryRun,
      })}`,
    );

    return {
      status: 'queued' as const,
      queueName: TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_NAME,
      jobName: TLQV_INVOICE_NOTA_CREDITO_BULK_JOB_NAME,
      batchId,
      totalRequested: normalized.totalRequested,
      totalUnique: normalized.unique.length,
      totalDuplicated: normalized.totalDuplicated,
      totalQueued: queuedJobs.length,
      dryRun,
      issueDate: command.issueDate,
      attempts: this.readAttempts(),
      concurrency: this.readConcurrency(),
      bullBoardPath:
        this.readOptionalConfig('BULL_BOARD_BASE_PATH') ?? '/admin/queues',
      sampleJobs: queuedJobs.slice(0, 20).map((job) => ({
        jobId: String(job.id),
        tlqvCode: job.data.tlqvCode,
      })),
    };
  }

  /**
   * Recent batches with their tallies, so the panel can show what was run
   * without anyone having noted the batchId. Reads what is still in the queue:
   * completed jobs are eventually removed, so the lasting record of what was
   * issued is Madre (documentKind=CREDIT_NOTE) and of what failed, the issues.
   */
  async listRecentBatches(limit = 20) {
    const states: TlqvInvoiceNotaCreditoBulkJobState[] = [
      'completed',
      'failed',
      'active',
      'waiting',
      'delayed',
      'paused',
    ];
    const batches = new Map<
      string,
      {
        batchId: string;
        requestedAt: string;
        dryRun: boolean;
        total: number;
        created: number;
        skipped: number;
        blocked: number;
        failed: number;
        pending: number;
      }
    >();

    for (const state of states) {
      for (const job of await this.queue.getJobs([state], 0, 5_000)) {
        const data = job.data;
        if (data?.batchId === undefined) {
          continue;
        }

        const entry = batches.get(data.batchId) ?? {
          batchId: data.batchId,
          requestedAt: data.requestedAt,
          dryRun: data.dryRun,
          total: 0,
          created: 0,
          skipped: 0,
          blocked: 0,
          failed: 0,
          pending: 0,
        };
        entry.total += 1;

        const result = job.returnvalue as
          TlqvInvoiceNotaCreditoBulkJobResult | undefined;
        if (state === 'failed') {
          entry.failed += 1;
        } else if (result?.status === 'created') {
          entry.created += 1;
        } else if (result?.status === 'skipped') {
          entry.skipped += 1;
        } else if (result?.status === 'blocked') {
          entry.blocked += 1;
        } else {
          entry.pending += 1;
        }

        batches.set(data.batchId, entry);
      }
    }

    return {
      queueName: TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_NAME,
      total: batches.size,
      batches: [...batches.values()]
        .sort((left, right) =>
          String(right.requestedAt).localeCompare(String(left.requestedAt)),
        )
        .slice(0, limit),
    };
  }

  async getBatchStatus(batchId: string) {
    const states: TlqvInvoiceNotaCreditoBulkJobState[] = [
      'completed',
      'failed',
      'active',
      'waiting',
      'delayed',
      'paused',
    ];
    const counts: Record<string, number> = {};
    const jobs: Array<{
      jobId: string;
      tlqvCode: string;
      state: TlqvInvoiceNotaCreditoBulkJobState;
      attemptsMade: number;
      status?: CreateNotaCreditoStatus;
      created?: boolean;
      blockerCodes?: string[];
      notaCreditoNumeroDocumento?: string | null;
      notaCreditoCae?: string | null;
      fiscalmenteEmitido?: boolean;
      failedReason?: string;
    }> = [];

    for (const state of states) {
      const found = await this.queue.getJobs([state], 0, 5_000);
      const mine = found.filter((job) => job.data?.batchId === batchId);
      counts[state] = mine.length;
      for (const job of mine) {
        // BullMQ types returnvalue as any; narrow it before reading.
        const result = job.returnvalue as
          TlqvInvoiceNotaCreditoBulkJobResult | undefined;
        jobs.push({
          jobId: String(job.id),
          tlqvCode: job.data.tlqvCode,
          state,
          attemptsMade: job.attemptsMade,
          status: result?.status,
          created: result?.created,
          blockerCodes: result?.blockerCodes,
          notaCreditoNumeroDocumento: result?.notaCreditoNumeroDocumento,
          notaCreditoCae: result?.notaCreditoCae,
          fiscalmenteEmitido: result?.fiscalmenteEmitido,
          failedReason: job.failedReason,
        });
      }
    }

    return {
      batchId,
      queueName: TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_NAME,
      found: jobs.length > 0,
      totalJobs: jobs.length,
      counts,
      results: {
        created: jobs.filter((job) => job.created === true).length,
        skipped: jobs.filter((job) => job.status === 'skipped').length,
        blocked: jobs.filter((job) => job.status === 'blocked').length,
        failed: jobs.filter((job) => job.state === 'failed').length,
        pending: jobs.filter((job) =>
          ['waiting', 'active', 'delayed', 'paused'].includes(job.state),
        ).length,
      },
      jobs,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async processJob(
    job: Job<TlqvInvoiceNotaCreditoBulkJobData>,
  ): Promise<TlqvInvoiceNotaCreditoBulkJobResult> {
    this.logger.log(
      `TLQV invoice nota credito job started ${JSON.stringify({
        jobId: job.id,
        batchId: job.data.batchId,
        tlqvCode: job.data.tlqvCode,
        dryRun: job.data.dryRun,
        attempt: job.attemptsMade + 1,
      })}`,
    );

    const response =
      await this.tlqvInvoiceFacturasService.createNotaCreditoFromTlqv({
        tlqvCode: job.data.tlqvCode,
        dryRun: job.data.dryRun,
        issueDate: job.data.issueDate,
      });

    // Only real runs are recorded: a dry run did not happen, and logging it
    // would fill the panel with simulations. A blocked nota de crédito is the
    // one thing an admin has to act on, and the job holding it is eventually
    // removed from the queue, so it is persisted in Madre instead.
    if (!job.data.dryRun && response.status === 'blocked') {
      await this.invoiceClientIssueRecorder.recordNotaCreditoBlocked({
        tlqvCode: job.data.tlqvCode,
        blockerCodes: response.blockers.map((blocker) => blocker.code),
        message: response.blockers
          .map((blocker) => `${blocker.code}: ${blocker.message}`)
          .join(' | '),
        source: 'tlqv_invoice_nota_credito_bulk_queue',
        metadata: {
          batchId: job.data.batchId,
          jobId: String(job.id),
          cancelledInvoice: response.cancelledInvoice,
        },
      });
    }

    return buildJobResult(job.data.batchId, job.data.tlqvCode, response);
  }

  private async waitUntilQueueReady(): Promise<void> {
    try {
      await waitUntilQueueReady(
        this.queue,
        this.readPositiveIntegerConfig(
          'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_READY_TIMEOUT_MS',
          DEFAULT_QUEUE_READY_TIMEOUT_MS,
        ),
      );
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `La cola de notas de crédito no está disponible. ${readErrorMessage(error)}`,
      );
    }
  }

  private buildDefaultJobOptions(): JobsOptions {
    return {
      attempts: this.readAttempts(),
      backoff: {
        type: 'fixed',
        delay: this.readPositiveIntegerConfig(
          'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_RETRY_DELAY_MS',
          30_000,
        ),
      },
      removeOnComplete: {
        count: this.readPositiveIntegerConfig(
          'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_REMOVE_COMPLETE_COUNT',
          5_000,
        ),
      },
      removeOnFail: {
        count: this.readPositiveIntegerConfig(
          'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_REMOVE_FAIL_COUNT',
          5_000,
        ),
      },
    };
  }

  private registerWorkerLogging(): void {
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `TLQV invoice nota credito job failed ${JSON.stringify({
          jobId: job?.id,
          tlqvCode: job?.data.tlqvCode,
          attemptsMade: job?.attemptsMade,
          message: readErrorMessage(error),
        })}`,
      );
    });
  }

  /**
   * One at a time by default. A nota de crédito is a fiscal document, and
   * issuing them serially keeps the numbering in the order the batch was sent.
   */
  private readConcurrency(): number {
    return this.readPositiveIntegerConfig(
      'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_CONCURRENCY',
      1,
    );
  }

  /**
   * A single attempt by default. Anything worth retrying is reported as a
   * blocker, not thrown — and a retry that issued a second nota de crédito
   * would carry its own CAE. The interactor refuses to cancel the same factura
   * twice, so this is defence in depth rather than the only guard.
   */
  private readAttempts(): number {
    return this.readPositiveIntegerConfig(
      'TLQV_INVOICE_NOTA_CREDITO_BULK_QUEUE_ATTEMPTS',
      1,
    );
  }

  private readPositiveIntegerConfig(
    name: string,
    defaultValue: number,
  ): number {
    const raw = this.readOptionalConfig(name);
    if (raw === undefined) {
      return defaultValue;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer`);
    }

    return parsed;
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    return value.trim();
  }
}

function buildJobResult(
  batchId: string,
  tlqvCode: string,
  response: CreateNotaCreditoFromTlqvResponse,
): TlqvInvoiceNotaCreditoBulkJobResult {
  return {
    batchId,
    tlqvCode,
    status: response.status,
    created: response.status === 'created',
    blockerCodes: response.blockers.map((blocker) => blocker.code),
    cancelledNumeroDocumento: response.cancelledInvoice?.numeroDocumento,
    notaCreditoNumeroDocumento:
      response.createdNotaCredito?.invoice.numeroDocumento,
    notaCreditoCae: response.caeStatus?.cae,
    fiscalmenteEmitido: response.caeStatus?.fiscalmenteEmitido,
  };
}

function normalizeUniqueTlqvCodes(values: string[]): {
  unique: string[];
  totalRequested: number;
  totalDuplicated: number;
} {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim().toUpperCase();
    const match = normalized.match(/TLQV-\d+/);
    const code = match?.[0] ?? normalized;
    if (code === '' || seen.has(code)) {
      continue;
    }
    seen.add(code);
    unique.push(code);
  }

  return {
    unique,
    totalRequested: values.length,
    totalDuplicated: values.length - unique.length,
  };
}

function buildBatchId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `tlqv-nota-credito-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function buildJobId(batchId: string, tlqvCode: string): string {
  return `tlqv-nota-credito:${batchId}:${tlqvCode}`;
}
