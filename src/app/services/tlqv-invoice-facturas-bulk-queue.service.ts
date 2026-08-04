import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Job, Queue, Worker, type JobsOptions } from 'bullmq';
import type { IInvoiceClientIssueRepository } from '../../core/adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import {
  INVOICE_CLIENT_ISSUE_REASONS,
  type InvoiceClientIssueReason,
} from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
import type {
  CreateTlqvInvoiceFlowCommand,
  CreateTlqvInvoiceFlowResponse,
  TlqvInvoiceFlowBlocker,
} from '../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import {
  readErrorMessage,
  waitUntilQueueReady,
} from '../drivers/queue/wait-until-queue-ready';
import { INVOICE_CLIENT_ISSUES_REPOSITORY } from '../modules/tlqv-invoice/issues/tlqv-invoice-issues.providers';
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
    @Inject(INVOICE_CLIENT_ISSUES_REPOSITORY)
    private readonly invoiceClientIssueRepository: IInvoiceClientIssueRepository,
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
    const attempt = job.attemptsMade + 1;
    this.logger.log(
      `TLQV invoice factura bulk job started ${JSON.stringify({
        jobId: job.id,
        batchId: job.data.batchId,
        tlqvCode: job.data.tlqvCode,
        dryRun: job.data.command.dryRun,
        issueDate: job.data.command.issueDate,
        attempt,
      })}`,
    );
    await job.updateProgress({
      status: 'running',
      tlqvCode: job.data.tlqvCode,
      batchId: job.data.batchId,
      attempt,
    });

    try {
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

        if (isLastJobAttempt(job, attempt)) {
          await this.recordBlockedInvoiceIssue({
            job,
            response,
            result,
            issueKind: 'retry_attempts_exhausted',
            attempt,
          });
        }

        throw new RetryableTlqvInvoiceFacturaError(job.data.tlqvCode, response);
      }

      if (response.status === 'blocked') {
        await this.recordBlockedInvoiceIssue({
          job,
          response,
          result,
          issueKind: 'blocked',
          attempt,
        });
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
    } catch (error: unknown) {
      if (
        !(error instanceof RetryableTlqvInvoiceFacturaError) &&
        isLastJobAttempt(job, attempt)
      ) {
        await this.recordUnhandledJobFailureIssue({
          job,
          error,
          attempt,
        });
      }

      throw error;
    }
  }

  private async recordBlockedInvoiceIssue(command: {
    job: Job<TlqvInvoiceFacturaBulkJobData>;
    response: CreateTlqvInvoiceFlowResponse;
    result: TlqvInvoiceFacturaBulkJobResult;
    issueKind: 'blocked' | 'retry_attempts_exhausted';
    attempt: number;
  }): Promise<void> {
    if (command.response.status !== 'blocked') {
      return;
    }

    const blockers = command.response.blockers;
    const reason = resolveInvoiceClientIssueReason(blockers);

    if (reason === 'INVALID_FISCAL_DOCUMENT') {
      return;
    }

    try {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode: command.job.data.tlqvCode,
        reason,
        source: 'invoice_api',
        saleNumber: readSaleNumber(command.response),
        buyerName: readBuyerName(command.response),
        email: readBuyerEmail(command.response),
        cuit: readBuyerDocumento(command.response),
        documentoTipo: readDocumentoTipo(command.response),
        documentoNro: readBuyerDocumento(command.response),
        documentoNroDigits: readBuyerDocumentoDigits(command.response),
        message: buildBlockedIssueMessage(blockers),
        messages: buildBlockedIssueMessages(blockers),
        rawPayload: {
          status: command.response.status,
          blockers,
        },
        metadata: {
          source: 'tlqv_invoice_facturas_bulk_queue',
          issueKind: command.issueKind,
          queueName: TLQV_INVOICE_FACTURAS_BULK_QUEUE_NAME,
          jobName: TLQV_INVOICE_FACTURAS_BULK_JOB_NAME,
          jobId: String(command.job.id),
          batchId: command.job.data.batchId,
          requestedAt: command.job.data.requestedAt,
          dryRun: command.job.data.command.dryRun,
          issueDate: command.job.data.command.issueDate,
          attempt: command.attempt,
          maxAttempts: readJobMaxAttempts(command.job),
          blockerCodes: command.result.blockerCodes,
          result: {
            status: command.result.status,
            canContinue: command.result.canContinue,
            created: command.result.created,
            skipped: command.result.skipped,
            transaccionId: command.result.transaccionId,
            numeroDocumento: command.result.numeroDocumento,
          },
          response: command.response,
        },
        now: new Date(),
      });
    } catch (error: unknown) {
      this.logger.error(
        `TLQV invoice factura blocked issue registration failed ${JSON.stringify(
          {
            jobId: command.job.id,
            batchId: command.job.data.batchId,
            tlqvCode: command.job.data.tlqvCode,
            reason,
            errorMessage: readErrorMessage(error),
          },
        )}`,
      );
    }
  }

  private async recordUnhandledJobFailureIssue(command: {
    job: Job<TlqvInvoiceFacturaBulkJobData>;
    error: unknown;
    attempt: number;
  }): Promise<void> {
    try {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode: command.job.data.tlqvCode,
        reason: 'TLQV_INVOICE_JOB_FAILED',
        source: 'invoice_api',
        message: `Falló el job bulk de facturación para ${command.job.data.tlqvCode}. ${readErrorMessage(
          command.error,
        )}`,
        messages: [readErrorMessage(command.error)],
        rawPayload: {
          errorMessage: readErrorMessage(command.error),
        },
        metadata: {
          source: 'tlqv_invoice_facturas_bulk_queue',
          issueKind: 'job_failed',
          queueName: TLQV_INVOICE_FACTURAS_BULK_QUEUE_NAME,
          jobName: TLQV_INVOICE_FACTURAS_BULK_JOB_NAME,
          jobId: String(command.job.id),
          batchId: command.job.data.batchId,
          requestedAt: command.job.data.requestedAt,
          dryRun: command.job.data.command.dryRun,
          issueDate: command.job.data.command.issueDate,
          attempt: command.attempt,
          maxAttempts: readJobMaxAttempts(command.job),
        },
        now: new Date(),
      });
    } catch (error: unknown) {
      this.logger.error(
        `TLQV invoice factura failed issue registration failed ${JSON.stringify(
          {
            jobId: command.job.id,
            batchId: command.job.data.batchId,
            tlqvCode: command.job.data.tlqvCode,
            errorMessage: readErrorMessage(error),
          },
        )}`,
      );
    }
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

function isLastJobAttempt(
  job: Job<TlqvInvoiceFacturaBulkJobData>,
  attempt: number,
): boolean {
  return attempt >= readJobMaxAttempts(job);
}

function readJobMaxAttempts(job: Job<TlqvInvoiceFacturaBulkJobData>): number {
  const attempts = job.opts.attempts;
  return typeof attempts === 'number' && attempts > 0 ? attempts : 1;
}

function resolveInvoiceClientIssueReason(
  blockers: TlqvInvoiceFlowBlocker[],
): InvoiceClientIssueReason {
  for (const blocker of blockers) {
    if (isInvoiceClientIssueReason(blocker.code)) {
      return blocker.code;
    }
  }

  return 'TLQV_INVOICE_FLOW_BLOCKED';
}

function isInvoiceClientIssueReason(
  value: string,
): value is InvoiceClientIssueReason {
  return INVOICE_CLIENT_ISSUE_REASONS.includes(
    value as InvoiceClientIssueReason,
  );
}

function buildBlockedIssueMessage(blockers: TlqvInvoiceFlowBlocker[]): string {
  const firstBlocker = blockers[0];

  if (firstBlocker === undefined) {
    return 'El flujo bulk de facturación quedó bloqueado sin blocker informado.';
  }

  return `${firstBlocker.step} | ${firstBlocker.code}: ${firstBlocker.message}`;
}

function buildBlockedIssueMessages(
  blockers: TlqvInvoiceFlowBlocker[],
): string[] {
  if (blockers.length === 0) {
    return ['El flujo bulk de facturación quedó bloqueado.'];
  }

  return blockers.map(
    (blocker) => `${blocker.step} | ${blocker.code}: ${blocker.message}`,
  );
}

function readSaleNumber(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return (
    response.clienteFlow?.orderDetails?.saleNumber ??
    response.clienteFlow?.prepare.stockBueItem?.saleNumber ??
    null
  );
}

function readBuyerName(response: CreateTlqvInvoiceFlowResponse): string | null {
  return response.clienteFlow?.buyerData?.nombreDestinatario ?? null;
}

function readBuyerEmail(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return response.clienteFlow?.buyerData?.email ?? null;
}

function readBuyerDocumento(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return (
    readClienteFlowFiscalInfo(response)?.documentoNro ??
    response.clienteFlow?.buyerData?.cuitComprador ??
    null
  );
}

function readBuyerDocumentoDigits(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return (
    readClienteFlowFiscalInfo(response)?.documentoNroDigits ??
    response.clienteFlow?.buyerData?.cuitCompradorDigits ??
    null
  );
}

function readDocumentoTipo(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return response.clienteFlow?.documentoTipo ?? null;
}

function readClienteFlowFiscalInfo(
  response: CreateTlqvInvoiceFlowResponse,
): { documentoNro?: string | null; documentoNroDigits?: string | null } | null {
  const clienteFlow = response.clienteFlow;

  if (clienteFlow === undefined || !clienteFlow.canContinue) {
    return null;
  }

  return clienteFlow.fiscalInfo;
}

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
