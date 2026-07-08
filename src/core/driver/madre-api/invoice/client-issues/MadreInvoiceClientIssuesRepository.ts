import axios, { type AxiosInstance } from 'axios';
import type { IInvoiceClientIssueRepository } from '../../../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type {
  GetInvoiceClientIssueByTlqvCodeCommand,
  GetInvoiceClientIssueByTlqvCodeResponse,
  GetInvoiceClientIssueSnapshotCommand,
  InvoiceClientIssue,
  InvoiceClientIssueReason,
  InvoiceClientIssueSnapshot,
  InvoiceClientIssueSource,
  InvoiceClientIssueStatus,
  UpsertInvoiceClientIssueCommand,
} from '../../../../entities/invoice/client-issues/InvoiceClientIssue';

const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const BASE_PATH = '/api/internal/invoice/client-issues';

export interface MadreInvoiceClientIssuesRepositoryOptions {
  baseUrl?: string;
  internalApiKey?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

interface UpsertMadreInvoiceClientIssuePayload {
  tlqvCode: string;
  reason: InvoiceClientIssueReason;
  source: InvoiceClientIssueSource;
  saleNumber?: string | null;
  buyerName?: string | null;
  email?: string | null;
  documentoTipo?: string | null;
  documentoNro?: string | null;
  documentoNroDigits?: string | null;
  message: string;
  messages?: string[];
  rawPayload?: unknown;
  metadata?: unknown;
}

export class MadreInvoiceClientIssuesRequestError extends Error {
  constructor(operation: string, detail: string) {
    super(
      `Madre API request failed while trying to ${operation} invoice client issue: ${detail}`,
    );
    this.name = MadreInvoiceClientIssuesRequestError.name;
  }
}

export class MadreInvoiceClientIssuesInvalidResponseError extends Error {
  constructor(detail: string) {
    super(
      `Madre API returned an invalid invoice client issue response: ${detail}`,
    );
    this.name = MadreInvoiceClientIssuesInvalidResponseError.name;
  }
}

export class MadreInvoiceClientIssuesRepository implements IInvoiceClientIssueRepository {
  private readonly httpClient: AxiosInstance;
  private readonly internalApiKey?: string;

  constructor(options: MadreInvoiceClientIssuesRepositoryOptions = {}) {
    this.internalApiKey = options.internalApiKey;
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: readRequiredBaseUrl(options.baseUrl),
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
        headers: buildBaseHeaders(),
      });
  }

  async upsert(command: UpsertInvoiceClientIssueCommand): Promise<void> {
    try {
      await this.httpClient.post<unknown>(
        `${BASE_PATH}/upsert`,
        buildUpsertPayload(command),
        {
          headers: this.buildHeaders(),
        },
      );
    } catch (error: unknown) {
      throw buildRequestError('upsert', error);
    }
  }

  async getSnapshot(
    command: GetInvoiceClientIssueSnapshotCommand = {},
  ): Promise<InvoiceClientIssueSnapshot> {
    try {
      const response = await this.httpClient.get<unknown>(BASE_PATH, {
        headers: this.buildHeaders(),
        params: {
          reason: command.reason,
          status: command.status,
          limit: command.limit,
        },
      });

      return parseIssueCollectionResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreInvoiceClientIssuesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('list', error);
    }
  }

  async getByTlqvCode(
    command: GetInvoiceClientIssueByTlqvCodeCommand,
  ): Promise<GetInvoiceClientIssueByTlqvCodeResponse> {
    const tlqvCode = command.tlqvCode.trim();
    if (tlqvCode === '') {
      return { items: [] };
    }

    try {
      const response = await this.httpClient.get<unknown>(
        `${BASE_PATH}/by-tlqv-code/${encodeURIComponent(tlqvCode)}`,
        {
          headers: this.buildHeaders(),
        },
      );

      return parseIssueCollectionResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreInvoiceClientIssuesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('find by TLQV code', error);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers = buildBaseHeaders();

    if (
      this.internalApiKey !== undefined &&
      this.internalApiKey.trim() !== ''
    ) {
      headers['x-internal-api-key'] = this.internalApiKey.trim();
    }

    return headers;
  }
}

function buildUpsertPayload(
  command: UpsertInvoiceClientIssueCommand,
): UpsertMadreInvoiceClientIssuePayload {
  const cuit = normalizeOptionalString(command.cuit);
  const messages =
    command.messages === undefined || command.messages.length === 0
      ? [command.message]
      : command.messages;

  return {
    tlqvCode: command.tlqvCode.trim(),
    reason: command.reason,
    source: command.source,
    saleNumber: normalizeOptionalString(command.saleNumber),
    buyerName: normalizeOptionalString(command.buyerName),
    email: normalizeOptionalString(command.email),
    documentoTipo: normalizeOptionalString(command.documentoTipo),
    documentoNro: cuit,
    documentoNroDigits: cuit?.replace(/\D/g, '') ?? null,
    message: command.message,
    messages,
    rawPayload: command.rawPayload,
    metadata: {
      ...(isRecord(command.metadata) ? command.metadata : {}),
      recordedAt: command.now.toISOString(),
    },
  };
}

function parseIssueCollectionResponse(
  value: unknown,
): InvoiceClientIssueSnapshot {
  if (Array.isArray(value)) {
    return { items: value.map(parseIssue) };
  }

  if (!isRecord(value)) {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      'response must be an object or an array',
    );
  }

  if (!Array.isArray(value.items)) {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      'items must be an array',
    );
  }

  return {
    items: value.items.map(parseIssue),
  };
}

function parseIssue(value: unknown): InvoiceClientIssue {
  if (!isRecord(value)) {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      'issue item must be an object',
    );
  }

  const tlqvCode = readString(value, 'tlqvCode');
  const reason = readString(value, 'reason') as InvoiceClientIssueReason;
  const source = readString(value, 'source') as InvoiceClientIssueSource;
  const message = readString(value, 'message');
  const status = readOptionalString(value, 'status');

  return {
    id: readOptionalNumber(value, 'id'),
    key:
      readOptionalString(value, 'key') ??
      readOptionalString(value, 'issueKey') ??
      undefined,
    tlqvCode,
    reason,
    source,
    status: status === null ? undefined : (status as InvoiceClientIssueStatus),
    severity: readOptionalString(value, 'severity'),
    saleNumber: readOptionalString(value, 'saleNumber'),
    buyerName: readOptionalString(value, 'buyerName'),
    email: readOptionalString(value, 'email'),
    cuit:
      readOptionalString(value, 'cuit') ??
      readOptionalString(value, 'documentoNro'),
    documentoTipo: readOptionalString(value, 'documentoTipo'),
    documentoNro: readOptionalString(value, 'documentoNro'),
    documentoNroDigits: readOptionalString(value, 'documentoNroDigits'),
    message,
    messages: readOptionalStringArray(value, 'messages') ?? [message],
    occurrences:
      readOptionalNumber(value, 'occurrences') ??
      readOptionalNumber(value, 'occurrenceCount') ??
      1,
    firstSeenAt:
      readOptionalString(value, 'firstSeenAt') ??
      readOptionalString(value, 'createdAt') ??
      '',
    lastSeenAt:
      readOptionalString(value, 'lastSeenAt') ??
      readOptionalString(value, 'updatedAt') ??
      '',
    rawPayload: value.rawPayload,
    metadata: value.metadata,
  };
}

function buildRequestError(
  operation: string,
  error: unknown,
): MadreInvoiceClientIssuesRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new MadreInvoiceClientIssuesRequestError(operation, detail);
  }

  if (error instanceof Error) {
    return new MadreInvoiceClientIssuesRequestError(operation, error.message);
  }

  return new MadreInvoiceClientIssuesRequestError(operation, 'unknown error');
}

function serializeResponseBody(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'unserializable response body';
  }
}

function buildBaseHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function readRequiredBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error('Madre API baseUrl is required');
  }

  return value.trim();
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      `${field} must be a string`,
    );
  }

  return value;
}

function readOptionalString(
  source: Record<string, unknown>,
  field: string,
): string | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      `${field} must be a string`,
    );
  }

  return value;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number') {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      `${field} must be a number`,
    );
  }

  return value;
}

function readOptionalStringArray(
  source: Record<string, unknown>,
  field: string,
): string[] | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new MadreInvoiceClientIssuesInvalidResponseError(
      `${field} must be an array of strings`,
    );
  }

  return value as string[];
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
