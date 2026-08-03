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
  CreateTlqvInvoiceFlowCommand,
  CreateTlqvInvoiceFlowResponse,
  TlqvInvoiceFlowBlocker,
} from '../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import {
  readErrorMessage,
  waitUntilQueueReady,
} from '../drivers/queue/wait-until-queue-ready';
import { RedisConnectionOptionsFactory } from '../drivers/redis/redis-connection-options.factory';
import { TlqvInvoiceFacturasService } from './tlqv-invoice-facturas.service';

export const TLQV_INVOICE_FACTURAS_BULK_QUEUE_NAME =
  'tlqv-invoice-facturas-bulk';
const TLQV_INVOICE_FACTURAS_BULK_JOB_NAME = 'create-from-tlqv';
const DEFAULT_QUEUE_READY_TIMEOUT_MS = 10_000;
const DEFAULT_ADD_CHUNK_SIZE = 500;

export interface TlqvInvoiceFacturaBulkJobData {
  batchId: string;
  tlqvCode: string;
  command: CreateTlqvInvoiceFlowCommand;
  source: 'manual';
  requestedAt: string;
}

export interface TlqvInvoiceFacturaBulkJobResult {
  batchId: string;
  tlqvCode: string;
  status: CreateTlqvInvoiceFlowResponse['status'];
  canContinue: boolean;
  created: boolean;
  skipped: boolean;
  blockerCodes: string[];
  transaccionId?: number | null;
  numeroDocumento?: string | null;
  response: CreateTlqvInvoiceFlowResponse;
}

export interface EnqueueTlqvInvoiceFacturasBulkCommand {
  tlqvCodes: string[];
  issueDate?: string;
  dryRun?: boolean;
}

export interface EnqueueTlqvInvoiceFacturasBulkResponse {
  status: 'queued';
  queueName: string;
  jobName: string;
  batchId: string;
  totalRequested: number;
  totalUnique: number;
  totalDuplicated: number;
  totalQueued: number;
  issueDate?: string;
  dryRun: boolean;
  attempts: number;
  concurrency: number;
  bullBoardPath: string;
  jobIdPattern: string;
  sampleJobs: Array<{
    jobId: string;
    tlqvCode: string;
  }>;
}

@Injectable()
export class TlqvInvoiceFacturasBulkQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(
    TlqvInvoiceFacturasBulkQueueService.name,
  );
  private readonly queue: Queue<TlqvInvoiceFacturaBulkJobData>;
  private readonly worker: Worker<
    TlqvInvoiceFacturaBulkJobData,
    TlqvInvoiceFacturaBulkJobResult
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly tlqvInvoiceFacturasService: TlqvInvoiceFacturasService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    const connection = this.redisConnectionOptionsFactory.build();

    this.queue = new Queue<TlqvInvoiceFacturaBulkJobData>(
      TLQV_INVOICE_FACTURAS_BULK_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: this.buildDefaultJobOptions(),
      },
    );
    this.worker = new Worker<
      TlqvInvoiceFacturaBulkJobData,
      TlqvInvoiceFacturaBulkJobResult
    >(
      TLQV_INVOICE_FACTURAS_BULK_QUEUE_NAME,
      (job) => this.processCreateInvoiceJob(job),
      {
        connection,
        concurrency: this.readConcurrency(),
      },
    );

    this.registerWorkerLogging();
  }

  getQueue(): Queue<TlqvInvoiceFacturaBulkJobData> {
    return this.queue;
  }

  async enqueueBulk(
    command: EnqueueTlqvInvoiceFacturasBulkCommand,
  ): Promise<EnqueueTlqvInvoiceFacturasBulkResponse> {
    await this.waitUntilQueueReady();

    const normalizedTlqvCodes = normalizeUniqueTlqvCodes(command.tlqvCodes);
    const batchId = buildBatchId();
    const dryRun = command.dryRun ?? true;
    const attempts = this.readAttempts();
    const concurrency = this.readConcurrency();
    const requestedAt = new Date().toISOString();
    const jobs = normalizedTlqvCodes.unique.map((tlqvCode) => ({
      name: TLQV_INVOICE_FACTURAS_BULK_JOB_NAME,
      data: {
        batchId,
        tlqvCode,
        source: 'manual' as const,
        requestedAt,
        command: {
          tlqvCode,
          stopAfter: 'invoice_creation' as const,
          dryRun,
          issueDate: command.issueDate,
        },
      },
      opts: {
        jobId: buildCreateInvoiceJobId(batchId, tlqvCode),
      },
    }));

    const queuedJobs: Job<TlqvInvoiceFacturaBulkJobData>[] = [];
    const addChunkSize = this.readPositiveIntegerConfig(
      'TLQV_INVOICE_FACTURAS_BULK_QUEUE_ADD_CHUNK_SIZE',
      DEFAULT_ADD_CHUNK_SIZE,
    );

    for (let index = 0; index < jobs.length; index += addChunkSize) {
      const chunk = jobs.slice(index, index + addChunkSize);
      const createdJobs = await this.queue.addBulk(chunk);
      queuedJobs.push(...createdJobs);
    }

    this.logger.log(
      `TLQV invoice facturas bulk queued ${JSON.stringify({
        batchId,
        totalRequested: normalizedTlqvCodes.totalRequested,
        totalUnique: normalizedTlqvCodes.unique.length,
        totalDuplicated: normalizedTlqvCodes.totalDuplicated,
        totalQueued: queuedJobs.length,
        dryRun,
        issueDate: command.issueDate,
        attempts,
        concurrency,
      })}`,
    );

    return {
      status: 'queued',
      queueName: TLQV_INVOICE_FACTURAS_BULK_QUEUE_NAME,
      jobName: TLQV_INVOICE_FACTURAS_BULK_JOB_NAME,
      batchId,
      totalRequested: normalizedTlqvCodes.totalRequested,
      totalUnique: normalizedTlqvCodes.unique.length,
      totalDuplicated: normalizedTlqvCodes.totalDuplicated,
      totalQueued: queuedJobs.length,
      issueDate: command.issueDate,
      dryRun,
      attempts,
      concurrency,
      bullBoardPath:
        this.readOptionalConfig('BULL_BOARD_BASE_PATH') ?? '/admin/queues',
      jobIdPattern: `tlqv-invoice:${batchId}:TLQV-XXXX`,
      sampleJobs: queuedJobs.slice(0, 20).map((job) => ({
        jobId: String(job.id),
        tlqvCode: job.data.tlqvCode,
      })),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async processCreateInvoiceJob(
    job: Job<TlqvInvoiceFacturaBulkJobData>,
  ): Promise<TlqvInvoiceFacturaBulkJobResult> {
    this.logger.log(
      `TLQV invoice factura bulk job started ${JSON.stringify({
        jobId: job.id,
        batchId: job.data.batchId,
        tlqvCode: job.data.tlqvCode,
        dryRun: job.data.command.dryRun,
        issueDate: job.data.command.issueDate,
        attempt: job.attemptsMade + 1,
      })}`,
    );
    await job.updateProgress({
      status: 'running',
      tlqvCode: job.data.tlqvCode,
      batchId: job.data.batchId,
      attempt: job.attemptsMade + 1,
    });

    const response = await this.tlqvInvoiceFacturasService.createFromTlqv(
      job.data.command,
    );
    const result = buildJobResult(
      job.data.batchId,
      job.data.tlqvCode,
      response,
    );

    if (shouldRetryResult(response)) {
      await job.updateProgress({
        status: 'retryable_blocked',
        tlqvCode: job.data.tlqvCode,
        batchId: job.data.batchId,
        blockerCodes: result.blockerCodes,
      });
      throw new RetryableTlqvInvoiceFacturaError(job.data.tlqvCode, response);
    }

    await job.updateProgress({
      status: result.status,
      tlqvCode: job.data.tlqvCode,
      batchId: job.data.batchId,
      created: result.created,
      skipped: result.skipped,
      blockerCodes: result.blockerCodes,
      transaccionId: result.transaccionId,
      numeroDocumento: result.numeroDocumento,
    });

    return result;
  }

  private registerWorkerLogging(): void {
    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `TLQV invoice factura bulk job completed ${JSON.stringify({
          jobId: job.id,
          batchId: result.batchId,
          tlqvCode: result.tlqvCode,
          status: result.status,
          created: result.created,
          skipped: result.skipped,
          blockerCodes: result.blockerCodes,
          transaccionId: result.transaccionId,
          numeroDocumento: result.numeroDocumento,
        })}`,
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `TLQV invoice factura bulk job failed ${JSON.stringify({
          jobId: job?.id,
          batchId: job?.data.batchId,
          tlqvCode: job?.data.tlqvCode,
          attemptsMade: job?.attemptsMade,
          errorMessage: error.message,
        })}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(
        `TLQV invoice factura bulk worker error ${JSON.stringify({
          errorMessage: error.message,
        })}`,
      );
    });
  }

  private buildDefaultJobOptions(): JobsOptions {
    return {
      attempts: this.readAttempts(),
      backoff: {
        type: 'fixed',
        delay: this.readNumberConfig(
          'TLQV_INVOICE_FACTURAS_BULK_QUEUE_RETRY_DELAY_MS',
          30_000,
        ),
      },
      removeOnComplete: {
        count: this.readNumberConfig(
          'TLQV_INVOICE_FACTURAS_BULK_QUEUE_REMOVE_COMPLETE_COUNT',
          5_000,
        ),
      },
      removeOnFail: {
        count: this.readNumberConfig(
          'TLQV_INVOICE_FACTURAS_BULK_QUEUE_REMOVE_FAIL_COUNT',
          5_000,
        ),
      },
    };
  }

  private async waitUntilQueueReady(): Promise<void> {
    try {
      await waitUntilQueueReady(
        this.queue,
        this.readNumberConfig(
          'TLQV_INVOICE_FACTURAS_BULK_QUEUE_READY_TIMEOUT_MS',
          DEFAULT_QUEUE_READY_TIMEOUT_MS,
        ),
      );
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `TLQV invoice facturas bulk queue is not ready. ${readErrorMessage(
          error,
        )}`,
      );
    }
  }

  private readAttempts(): number {
    return this.readPositiveIntegerConfig(
      'TLQV_INVOICE_FACTURAS_BULK_QUEUE_ATTEMPTS',
      3,
    );
  }

  private readConcurrency(): number {
    return this.readPositiveIntegerConfig(
      'TLQV_INVOICE_FACTURAS_BULK_QUEUE_CONCURRENCY',
      1,
    );
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

  private readPositiveIntegerConfig(
    name: string,
    defaultValue: number,
  ): number {
    const value = this.readNumberConfig(name, defaultValue);
    if (value < 1) {
      throw new Error(`${name} must be a positive integer`);
    }

    return value;
  }
}

function normalizeUniqueTlqvCodes(tlqvCodes: string[]): {
  totalRequested: number;
  totalDuplicated: number;
  unique: string[];
} {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const tlqvCode of tlqvCodes) {
    const normalized = normalizeTlqvCode(tlqvCode);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }

  return {
    totalRequested: tlqvCodes.length,
    totalDuplicated: tlqvCodes.length - unique.length,
    unique,
  };
}

function normalizeTlqvCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/TLQV-\d+/);
  return match?.[0] ?? normalized;
}

function buildBatchId(): string {
  return `tlqv-invoice-bulk-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

function buildCreateInvoiceJobId(batchId: string, tlqvCode: string): string {
  return `tlqv-invoice:${batchId}:${tlqvCode}`;
}

function buildJobResult(
  batchId: string,
  tlqvCode: string,
  response: CreateTlqvInvoiceFlowResponse,
): TlqvInvoiceFacturaBulkJobResult {
  const blockerCodes = getBlockerCodes(response);
  const transaccionId = response.createdInvoice?.invoice.transaccionId;
  const numeroDocumento = response.createdInvoice?.invoice.numeroDocumento;

  return {
    batchId,
    tlqvCode,
    status: response.status,
    canContinue: response.canContinue,
    created:
      response.status === 'completed' &&
      response.dryRun === false &&
      transaccionId !== undefined &&
      transaccionId !== null,
    skipped:
      response.status === 'blocked' ||
      response.dryRun === true ||
      response.createdInvoice === undefined,
    blockerCodes,
    transaccionId,
    numeroDocumento,
    response,
  };
}

function getBlockerCodes(response: CreateTlqvInvoiceFlowResponse): string[] {
  if (response.status !== 'blocked') {
    return [];
  }

  return response.blockers.map((blocker) => blocker.code);
}

function shouldRetryResult(response: CreateTlqvInvoiceFlowResponse): boolean {
  if (response.status !== 'blocked') {
    return false;
  }

  return response.blockers.some((blocker) =>
    RETRYABLE_BLOCKER_CODES.has(blocker.code),
  );
}

const RETRYABLE_BLOCKER_CODES = new Set<string>([
  'BILLING_VALIDATION_UNAVAILABLE',
  'FISCAL_INFO_UNAVAILABLE',
  'SPREADSHEET_SOURCE_DATA_UNAVAILABLE',
  'XUBIO_INVOICE_CREATION_FAILED',
]);

class RetryableTlqvInvoiceFacturaError extends Error {
  constructor(tlqvCode: string, response: CreateTlqvInvoiceFlowResponse) {
    super(
      `Retryable TLQV invoice factura failure for ${tlqvCode}: ${formatBlockers(
        response.status === 'blocked' ? response.blockers : [],
      )}`,
    );
    this.name = RetryableTlqvInvoiceFacturaError.name;
  }
}

function formatBlockers(blockers: TlqvInvoiceFlowBlocker[]): string {
  if (blockers.length === 0) {
    return 'unknown retryable blocker';
  }

  return blockers
    .map((blocker) => `${blocker.code} - ${blocker.message}`)
    .join(' | ');
}
