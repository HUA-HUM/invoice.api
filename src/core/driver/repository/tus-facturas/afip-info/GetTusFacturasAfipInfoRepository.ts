import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type { IGetTusFacturasAfipInfoRepository } from '../../../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type {
  GetTusFacturasAfipInfoCommand,
  GetTusFacturasAfipInfoResponse,
  TusFacturasAfipInfoInvalidDocument,
  TusFacturasDocumentoTipo,
} from '../../../../entities/tus-facturas/afip-info/TusFacturasAfipInfo';

const DEFAULT_BASE_URL = 'https://www.tusfacturas.app';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_IN_MILLISECONDS = 250;
const AFIP_INFO_PATH = '/app/api/v2/clientes/afip-info';
const DOCUMENTO_DIGITS_LENGTH = 11;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const FISCAL_INFO_FIELDS = [
  'razon_social',
  'condicion_impositiva',
  'direccion',
  'localidad',
  'codigopostal',
  'provincia',
  'estado',
] as const;

export interface GetTusFacturasAfipInfoRepositoryOptions {
  baseUrl?: string;
  userToken?: string;
  apiKey?: string;
  apiToken?: string;
  cookie?: string;
  timeoutInMilliseconds?: number;
  retryAttempts?: number;
  retryDelayInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

interface TusFacturasAfipInfoRequestPayload {
  usertoken: string;
  apikey: string;
  apitoken: string;
  cliente: {
    documento_nro: string;
    documento_tipo: TusFacturasDocumentoTipo;
  };
}

export class TusFacturasAfipInfoRequestError extends Error {
  constructor(documentoNro: string, detail: string) {
    super(
      `TusFacturas request failed while getting AFIP info for ${documentoNro}: ${detail}`,
    );
    this.name = TusFacturasAfipInfoRequestError.name;
  }
}

export class TusFacturasAfipInfoInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`TusFacturas returned an invalid AFIP info response: ${detail}`);
    this.name = TusFacturasAfipInfoInvalidResponseError.name;
  }
}

export class TusFacturasAfipInfoConfigurationError extends Error {
  constructor(field: string) {
    super(`${field} is required to call TusFacturas`);
    this.name = TusFacturasAfipInfoConfigurationError.name;
  }
}

export class GetTusFacturasAfipInfoRepository implements IGetTusFacturasAfipInfoRepository {
  private readonly httpClient: AxiosInstance;
  private readonly userToken?: string;
  private readonly apiKey?: string;
  private readonly apiToken?: string;
  private readonly cookie?: string;
  private readonly retryAttempts: number;
  private readonly retryDelayInMilliseconds: number;

  constructor(options: GetTusFacturasAfipInfoRepositoryOptions = {}) {
    this.userToken = options.userToken;
    this.apiKey = options.apiKey;
    this.apiToken = options.apiToken;
    this.cookie = options.cookie;
    this.retryAttempts = normalizeRetryAttempts(options.retryAttempts);
    this.retryDelayInMilliseconds = normalizeRetryDelay(
      options.retryDelayInMilliseconds,
    );
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getAfipInfo(
    command: GetTusFacturasAfipInfoCommand,
  ): Promise<GetTusFacturasAfipInfoResponse> {
    const documentoNroDigits = extractDocumentoNroDigits(command.documentoNro);
    const documentoTipo =
      command.documentoTipo ??
      inferDocumentoTipoFromDocumentoNroDigits(documentoNroDigits);

    if (documentoNroDigits.length !== DOCUMENTO_DIGITS_LENGTH) {
      return buildInvalidDocumentoLengthResponse(
        command.documentoNro,
        documentoNroDigits,
        documentoTipo,
      );
    }

    const documentoNro = formatDocumentoNro(documentoNroDigits);

    try {
      const response = await this.postAfipInfoWithRetry(
        documentoNro,
        documentoTipo,
      );

      return parseAfipInfoResponse(
        response.data,
        documentoNro,
        documentoNroDigits,
        documentoTipo,
      );
    } catch (error: unknown) {
      if (
        error instanceof TusFacturasAfipInfoInvalidResponseError ||
        error instanceof TusFacturasAfipInfoConfigurationError
      ) {
        throw error;
      }

      throw buildRequestError(documentoNroDigits, error);
    }
  }

  private async postAfipInfoWithRetry(
    documentoNro: string,
    documentoTipo: TusFacturasDocumentoTipo,
  ): Promise<AxiosResponse<unknown>> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        return await this.httpClient.post<unknown>(
          AFIP_INFO_PATH,
          this.buildPayload(documentoNro, documentoTipo),
          {
            headers: this.buildHeaders(),
          },
        );
      } catch (error: unknown) {
        lastError = error;
        if (
          attempt >= this.retryAttempts ||
          !isRetryableTusFacturasRequestError(error)
        ) {
          throw error;
        }

        await wait(this.retryDelayInMilliseconds);
      }
    }

    throw lastError;
  }

  private buildPayload(
    documentoNro: string,
    documentoTipo: TusFacturasDocumentoTipo,
  ): TusFacturasAfipInfoRequestPayload {
    return {
      usertoken: readRequiredCredential(this.userToken, 'userToken'),
      apikey: readRequiredCredential(this.apiKey, 'apiKey'),
      apitoken: readRequiredCredential(this.apiToken, 'apiToken'),
      cliente: {
        documento_nro: documentoNro,
        documento_tipo: documentoTipo,
      },
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.cookie !== undefined && this.cookie.trim() !== '') {
      headers.Cookie = this.cookie.trim();
    }

    return headers;
  }
}

function parseAfipInfoResponse(
  value: unknown,
  documentoNro: string,
  documentoNroDigits: string,
  documentoTipo: TusFacturasDocumentoTipo,
): GetTusFacturasAfipInfoResponse {
  const fiscalInfo = findFiscalInfoSource(value);

  if (isInvalidDocumentResponse(value)) {
    if (
      fiscalInfo !== undefined &&
      hasUsableFiscalInfoFromInvalidResponse(fiscalInfo)
    ) {
      return buildFoundResponse(
        value,
        fiscalInfo,
        documentoNro,
        documentoNroDigits,
        documentoTipo,
      );
    }

    return {
      status: 'invalid_document',
      found: false,
      invalidDocument: parseInvalidDocumentResponse(
        value,
        documentoNro,
        documentoNroDigits,
        documentoTipo,
      ),
    };
  }

  if (fiscalInfo === undefined) {
    throw new TusFacturasAfipInfoInvalidResponseError(
      'could not find AFIP info fields in response',
    );
  }

  return buildFoundResponse(
    value,
    fiscalInfo,
    documentoNro,
    documentoNroDigits,
    documentoTipo,
  );
}

function buildFoundResponse(
  rawPayload: unknown,
  fiscalInfo: Record<string, unknown>,
  documentoNro: string,
  documentoNroDigits: string,
  documentoTipo: TusFacturasDocumentoTipo,
): GetTusFacturasAfipInfoResponse {
  return {
    status: 'found',
    found: true,
    afipInfo: {
      documentoNro,
      documentoNroDigits,
      documentoTipo,
      razonSocial: readOptionalString(fiscalInfo, 'razon_social'),
      condicionImpositiva: readOptionalString(
        fiscalInfo,
        'condicion_impositiva',
      ),
      direccion: readOptionalString(fiscalInfo, 'direccion'),
      localidad: readOptionalString(fiscalInfo, 'localidad'),
      codigoPostal: readOptionalString(fiscalInfo, 'codigopostal'),
      provincia: readOptionalString(fiscalInfo, 'provincia'),
      estado: readOptionalString(fiscalInfo, 'estado'),
      rawPayload,
    },
  };
}

function parseInvalidDocumentResponse(
  value: unknown,
  documentoNro: string,
  documentoNroDigits: string,
  documentoTipo: TusFacturasDocumentoTipo,
): TusFacturasAfipInfoInvalidDocument {
  const messages = extractErrorMessages(value);

  return {
    documentoNro,
    documentoNroDigits,
    documentoTipo,
    message: messages[0] ?? 'TusFacturas could not recover AFIP information',
    messages,
    rawPayload: value,
  };
}

function isInvalidDocumentResponse(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.error === 'S' ||
    extractErrorMessages(value).some((message) =>
      normalizeForComparison(message).includes('NO PUDIMOS OBTENER DATOS'),
    )
  );
}

function extractErrorMessages(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.errores)) {
    return [];
  }

  const messages: string[] = [];
  for (const item of value.errores) {
    const nestedItems: unknown[] = Array.isArray(item) ? item : [item];
    for (const nestedItem of nestedItems) {
      if (typeof nestedItem !== 'string') {
        continue;
      }

      const message = nestedItem.trim();
      if (message !== '') {
        messages.push(message);
      }
    }
  }

  return messages;
}

function findFiscalInfoSource(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (hasAnyFiscalInfoField(value)) {
    return value;
  }

  for (const field of ['data', 'respuesta', 'resultado', 'cliente']) {
    const nestedValue = value[field];
    if (isRecord(nestedValue)) {
      const nestedFiscalInfo = findFiscalInfoSource(nestedValue);
      if (nestedFiscalInfo !== undefined) {
        return nestedFiscalInfo;
      }
    }
  }

  return undefined;
}

function hasAnyFiscalInfoField(value: Record<string, unknown>): boolean {
  return FISCAL_INFO_FIELDS.some((field) => value[field] !== undefined);
}

function hasUsableFiscalInfoFromInvalidResponse(
  value: Record<string, unknown>,
): boolean {
  return (
    hasNonEmptyStringField(value, 'razon_social') &&
    hasNonEmptyStringField(value, 'condicion_impositiva') &&
    hasNonEmptyStringField(value, 'estado')
  );
}

function hasNonEmptyStringField(
  value: Record<string, unknown>,
  field: string,
): boolean {
  const fieldValue = value[field];
  return typeof fieldValue === 'string' && fieldValue.trim() !== '';
}

function buildRequestError(
  documentoNro: string,
  error: unknown,
): TusFacturasAfipInfoRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new TusFacturasAfipInfoRequestError(documentoNro, detail);
  }

  if (error instanceof Error) {
    return new TusFacturasAfipInfoRequestError(documentoNro, error.message);
  }

  return new TusFacturasAfipInfoRequestError(documentoNro, 'unknown error');
}

function isRetryableTusFacturasRequestError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  return status === undefined || RETRYABLE_STATUS_CODES.has(status);
}

function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeRetryAttempts(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_RETRY_ATTEMPTS;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('retryAttempts must be a positive integer');
  }

  return value;
}

function normalizeRetryDelay(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_RETRY_DELAY_IN_MILLISECONDS;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      'retryDelayInMilliseconds must be a non-negative integer',
    );
  }

  return value;
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

function extractDocumentoNroDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function buildInvalidDocumentoLengthResponse(
  documentoNro: string,
  documentoNroDigits: string,
  documentoTipo: TusFacturasDocumentoTipo,
): GetTusFacturasAfipInfoResponse {
  const normalizedDocumentoNro = documentoNro.trim();
  const displayDocumentoNro =
    normalizedDocumentoNro === '' ? documentoNroDigits : normalizedDocumentoNro;
  const message = `documentoNro must contain exactly ${DOCUMENTO_DIGITS_LENGTH} digits`;

  return {
    status: 'invalid_document',
    found: false,
    invalidDocument: {
      documentoNro: displayDocumentoNro,
      documentoNroDigits,
      documentoTipo,
      message,
      messages: [
        message,
        `No se puede consultar TusFacturas con un documento que no tiene ${DOCUMENTO_DIGITS_LENGTH} dígitos.`,
      ],
      rawPayload: {
        error: 'INVALID_DOCUMENT_LENGTH',
        documentoNro: displayDocumentoNro,
        documentoNroDigits,
        expectedDigits: DOCUMENTO_DIGITS_LENGTH,
      },
    },
  };
}

function formatDocumentoNro(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function inferDocumentoTipoFromDocumentoNroDigits(
  digits: string,
): TusFacturasDocumentoTipo {
  const prefix = Number(digits.slice(0, 2));
  return prefix >= 30 ? 'CUIL' : 'CUIT';
}

function readRequiredCredential(
  value: string | undefined,
  field: string,
): string {
  if (value === undefined || value.trim() === '') {
    throw new TusFacturasAfipInfoConfigurationError(field);
  }

  return value.trim();
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
    throw new TusFacturasAfipInfoInvalidResponseError(
      `${field} must be a string or null`,
    );
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}
