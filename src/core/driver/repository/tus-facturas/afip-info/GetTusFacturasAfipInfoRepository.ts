import axios, { type AxiosInstance } from 'axios';
import type { IGetTusFacturasAfipInfoRepository } from '../../../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type {
  GetTusFacturasAfipInfoCommand,
  GetTusFacturasAfipInfoResponse,
  TusFacturasAfipInfoInvalidDocument,
  TusFacturasDocumentoTipo,
} from '../../../../entities/tus-facturas/afip-info/TusFacturasAfipInfo';

const DEFAULT_BASE_URL = 'https://www.tusfacturas.app';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const AFIP_INFO_PATH = '/app/api/v2/clientes/afip-info';
const DOCUMENTO_DIGITS_LENGTH = 11;

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

  constructor(options: GetTusFacturasAfipInfoRepositoryOptions = {}) {
    this.userToken = options.userToken;
    this.apiKey = options.apiKey;
    this.apiToken = options.apiToken;
    this.cookie = options.cookie;
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
    const documentoNroDigits = normalizeDocumentoNroDigits(
      command.documentoNro,
    );
    const documentoTipo =
      command.documentoTipo ??
      inferDocumentoTipoFromDocumentoNroDigits(documentoNroDigits);
    const documentoNro = formatDocumentoNro(documentoNroDigits);

    try {
      const response = await this.httpClient.post<unknown>(
        AFIP_INFO_PATH,
        this.buildPayload(documentoNro, documentoTipo),
        {
          headers: this.buildHeaders(),
        },
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
  if (isInvalidDocumentResponse(value)) {
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

  const fiscalInfo = findFiscalInfoSource(value);
  if (fiscalInfo === undefined) {
    throw new TusFacturasAfipInfoInvalidResponseError(
      'could not find AFIP info fields in response',
    );
  }

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
      rawPayload: value,
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
    value.apoc_existe === 'NO' ||
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

function normalizeDocumentoNroDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== DOCUMENTO_DIGITS_LENGTH) {
    throw new RangeError(
      `documentoNro must contain exactly ${DOCUMENTO_DIGITS_LENGTH} digits`,
    );
  }

  return digits;
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
