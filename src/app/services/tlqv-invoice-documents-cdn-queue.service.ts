import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker, type JobsOptions } from 'bullmq';
import {
  readErrorMessage,
  waitUntilQueueReady,
} from '../drivers/queue/wait-until-queue-ready';
import { RedisConnectionOptionsFactory } from '../drivers/redis/redis-connection-options.factory';
import {
  TlqvInvoiceDocumentsCdnResult,
  TlqvInvoiceDocumentsService,
} from './tlqv-invoice-documents.service';

export const TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_NAME =
  'tlqv-invoice-documents-cdn';
const TLQV_INVOICE_DOCUMENTS_CDN_JOB_NAME = 'generate-upload-cdn-pdf';
const DEFAULT_QUEUE_READY_TIMEOUT_MS = 10_000;
const DEFAULT_BULK_LIMIT = 500;

interface TlqvInvoiceDocumentsCdnJobData {
  tlqvCode: string;
  source: 'bulk' | 'manual';
}

interface TlqvInvoiceDocumentsCdnJobResult extends TlqvInvoiceDocumentsCdnResult {
  jobId: string;
}

export interface EnqueueTlqvInvoiceDocumentsCdnBulkCommand {
  tlqvCodes: string[];
}

export interface EnqueueTlqvInvoiceDocumentsCdnBulkResponse {
  status: 'queued';
  queueName: string;
  totalRequested: number;
  totalQueued: number;
  totalInvalid: number;
  jobs: Array<{
    tlqvCode: string;
    jobId: string;
  }>;
  invalidItems: Array<{
    value: string;
    reason: string;
  }>;
}

@Injectable()
export class TlqvInvoiceDocumentsCdnQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(
    TlqvInvoiceDocumentsCdnQueueService.name,
  );
  private readonly queue: Queue<TlqvInvoiceDocumentsCdnJobData>;
  private readonly worker: Worker<
    TlqvInvoiceDocumentsCdnJobData,
    TlqvInvoiceDocumentsCdnJobResult
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly documentsService: TlqvInvoiceDocumentsService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    const connection = this.redisConnectionOptionsFactory.build();

    this.queue = new Queue<TlqvInvoiceDocumentsCdnJobData>(
      TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: this.buildDefaultJobOptions(),
      },
    );
    this.worker = new Worker<
      TlqvInvoiceDocumentsCdnJobData,
      TlqvInvoiceDocumentsCdnJobResult
    >(TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_NAME, (job) => this.processJob(job), {
      connection,
      concurrency: this.readNumberConfig(
        'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_CONCURRENCY',
        2,
      ),
    });

    this.registerWorkerLogging();
  }

  getQueue(): Queue<TlqvInvoiceDocumentsCdnJobData> {
    return this.queue;
  }

  async enqueueBulk(
    command: EnqueueTlqvInvoiceDocumentsCdnBulkCommand,
  ): Promise<EnqueueTlqvInvoiceDocumentsCdnBulkResponse> {
    await this.waitUntilQueueReady();

    const normalized = normalizeTlqvCodes(
      command.tlqvCodes,
      this.readNumberConfig(
        'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_BULK_LIMIT',
        DEFAULT_BULK_LIMIT,
      ),
    );
    const jobs: EnqueueTlqvInvoiceDocumentsCdnBulkResponse['jobs'] = [];
    const now = Date.now();

    for (const [index, tlqvCode] of normalized.valid.entries()) {
      const job = await this.queue.add(
        TLQV_INVOICE_DOCUMENTS_CDN_JOB_NAME,
        {
          tlqvCode,
          source: 'bulk',
        },
        {
          jobId: buildJobId(tlqvCode, now, index),
        },
      );

      jobs.push({
        tlqvCode,
        jobId: String(job.id),
      });
    }

    this.logger.log(
      `TLQV invoice documents CDN bulk queued ${JSON.stringify({
        totalRequested: command.tlqvCodes.length,
        totalQueued: jobs.length,
        totalInvalid: normalized.invalid.length,
      })}`,
    );

    return {
      status: 'queued',
      queueName: TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_NAME,
      totalRequested: command.tlqvCodes.length,
      totalQueued: jobs.length,
      totalInvalid: normalized.invalid.length,
      jobs,
      invalidItems: normalized.invalid,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async processJob(
    job: Job<TlqvInvoiceDocumentsCdnJobData>,
  ): Promise<TlqvInvoiceDocumentsCdnJobResult> {
    this.logger.log(
      `TLQV invoice document CDN job started ${JSON.stringify({
        jobId: job.id,
        tlqvCode: job.data.tlqvCode,
        source: job.data.source,
      })}`,
    );

    const result = await this.documentsService.getOrCreateCdnPdf(
      job.data.tlqvCode,
    );

    return {
      ...result,
      jobId: String(job.id),
    };
  }

  private registerWorkerLogging(): void {
    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `TLQV invoice document CDN job completed ${JSON.stringify({
          jobId: job.id,
          tlqvCode: result.tlqvCode,
          status: result.status,
          cdnKey: result.cdnKey,
          cdnUrl: result.cdnUrl,
        })}`,
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `TLQV invoice document CDN job failed ${JSON.stringify({
          jobId: job?.id,
          tlqvCode: job?.data.tlqvCode,
          errorMessage: error.message,
        })}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(
        `TLQV invoice documents CDN worker error ${JSON.stringify({
          errorMessage: error.message,
        })}`,
      );
    });
  }

  private buildDefaultJobOptions(): JobsOptions {
    return {
      attempts: this.readNumberConfig(
        'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_ATTEMPTS',
        3,
      ),
      backoff: {
        type: 'fixed',
        delay: this.readNumberConfig(
          'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_RETRY_DELAY_MS',
          30_000,
        ),
      },
      removeOnComplete: {
        count: this.readNumberConfig(
          'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_REMOVE_COMPLETE_COUNT',
          1_000,
        ),
      },
      removeOnFail: {
        count: this.readNumberConfig(
          'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_REMOVE_FAIL_COUNT',
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
          'TLQV_INVOICE_DOCUMENTS_CDN_QUEUE_READY_TIMEOUT_MS',
          DEFAULT_QUEUE_READY_TIMEOUT_MS,
        ),
      );
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `TLQV invoice documents CDN queue is not ready. ${readErrorMessage(
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
}

function normalizeTlqvCodes(
  values: string[],
  limit: number,
): {
  valid: string[];
  invalid: Array<{ value: string; reason: string }>;
} {
  const valid: string[] = [];
  const invalid: Array<{ value: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const value of values.slice(0, limit)) {
    try {
      const tlqvCode = normalizeTlqvCode(value);
      if (seen.has(tlqvCode)) {
        continue;
      }
      seen.add(tlqvCode);
      valid.push(tlqvCode);
    } catch (error: unknown) {
      invalid.push({
        value,
        reason: error instanceof Error ? error.message : 'Invalid TLQV code',
      });
    }
  }

  if (values.length > limit) {
    invalid.push({
      value: `remaining ${values.length - limit} items`,
      reason: `Bulk limit is ${limit}`,
    });
  }

  return {
    valid,
    invalid,
  };
}

function normalizeTlqvCode(value: string): string {
  const trimmedValue = value.trim().toUpperCase();
  const match = /^TLQV\s*-?\s*(\d+)$/.exec(trimmedValue);
  if (match === null) {
    throw new RangeError('tlqvCode must use TLQV-123 format');
  }

  return `TLQV-${Number(match[1])}`;
}

function buildJobId(
  tlqvCode: string,
  timestamp: number,
  index: number,
): string {
  return `tlqv-invoice-document-cdn-${tlqvCode}-${timestamp}-${index}`;
}
