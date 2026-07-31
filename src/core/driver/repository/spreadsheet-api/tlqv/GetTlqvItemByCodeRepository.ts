import axios, { type AxiosInstance } from 'axios';
import type { IGetTlqvItemByCodeRepository } from '../../../../adapters/repositories/spreadsheet-api/tlqv/IGetTlqvItemByCodeRepository';
import {
  TLQV_SHEET_NAME,
  type GetTlqvItemByCodeCommand,
  type GetTlqvItemByCodeResponse,
  type TlqvItem,
  type TlqvItemData,
} from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';

const DEFAULT_BASE_URL = 'https://spreadsheet.loquieroaca.com';
const DEFAULT_SPREADSHEET_NAME = 'prueba-lectura';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 10_000;
const MAX_ERROR_BODY_LENGTH = 500;

const TLQV_ITEM_REQUIRED_FIELDS = [
  'TLQV',
  'Valor Declarado',
  'Peso',
  'PESOVOLUMENTICO',
  'VALORXKG',
  'DI',
  'TE',
  'IVA',
  'Total Impuestos',
  'Total Flete',
  'Fijo Liberacion',
  'Seguro',
  'Total',
  'tc',
  'tc2',
  'tc impuesto',
  'Productoco',
  'Productoco.b',
  'DIFACTURA',
  'DIFACTURA.B',
  'TEFACTURA',
  'TEFACTURA.B',
  'IVAFACTURA',
  'IVAFACTURA.B',
  'LAFACTURA',
  'LAFACTURA.B',
  'A13VENTA',
  'FLETEINTERNACIONALA',
  'FLETEINTERNACIONALB',
  'NRO CARGA',
] as const satisfies readonly (keyof TlqvItemData)[];

const TLQV_ITEM_OPTIONAL_FIELDS = [
  'Imp Internos',
  'Anti Dumping',
] as const satisfies readonly (keyof TlqvItemData)[];

export interface GetTlqvItemByCodeRepositoryOptions {
  baseUrl?: string;
  spreadsheetName?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class SpreadsheetApiTlqvByCodeRequestError extends Error {
  constructor(tlqvCode: string, detail: string) {
    super(
      `Spreadsheet API request failed for TLQV sheet item ${tlqvCode}: ${detail}`,
    );
    this.name = SpreadsheetApiTlqvByCodeRequestError.name;
  }
}

export class SpreadsheetApiTlqvByCodeInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Spreadsheet API returned an invalid TLQV item response: ${detail}`);
    this.name = SpreadsheetApiTlqvByCodeInvalidResponseError.name;
  }
}

export class GetTlqvItemByCodeRepository implements IGetTlqvItemByCodeRepository {
  private readonly httpClient: AxiosInstance;
  private readonly spreadsheetName: string;

  constructor(options: GetTlqvItemByCodeRepositoryOptions = {}) {
    this.spreadsheetName = options.spreadsheetName ?? DEFAULT_SPREADSHEET_NAME;
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getByCode(
    command: GetTlqvItemByCodeCommand,
  ): Promise<GetTlqvItemByCodeResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);

    try {
      const response = await this.httpClient.get<unknown>(
        `/sheet/${encodeURIComponent(this.spreadsheetName)}/${TLQV_SHEET_NAME}/${encodeURIComponent(tlqvCode)}`,
      );
      const item = parseResponse(response.data, tlqvCode);

      return {
        found: true,
        tlqvCode,
        item,
      };
    } catch (error: unknown) {
      if (error instanceof SpreadsheetApiTlqvByCodeInvalidResponseError) {
        throw error;
      }

      if (isNotFoundAxiosError(error)) {
        return {
          found: false,
          tlqvCode,
          reason: 'not_found',
          rawPayload: error.response?.data,
        };
      }

      throw new SpreadsheetApiTlqvByCodeRequestError(
        tlqvCode,
        buildRequestErrorDetail(error),
      );
    }
  }
}

function parseResponse(value: unknown, expectedTlqvCode: string): TlqvItem {
  if (!isRecord(value)) {
    throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
      'body must be an object',
    );
  }

  const item = parseItem(value);
  const responseTlqvCode = normalizeRequiredTlqvCode(item.data.TLQV);
  if (responseTlqvCode !== expectedTlqvCode) {
    throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
      `expected TLQV ${expectedTlqvCode}, received ${responseTlqvCode}`,
    );
  }

  return item;
}

function parseItem(value: unknown): TlqvItem {
  if (!isRecord(value)) {
    throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
      'item must be an object',
    );
  }
  if (!Number.isInteger(value.rowNumber) || Number(value.rowNumber) < 1) {
    throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
      'rowNumber must be a positive integer',
    );
  }
  if (!isRecord(value.data)) {
    throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
      'data must be an object',
    );
  }

  for (const field of TLQV_ITEM_REQUIRED_FIELDS) {
    if (typeof value.data[field] !== 'string') {
      throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
        `data.${field} must be a string`,
      );
    }
  }

  for (const field of TLQV_ITEM_OPTIONAL_FIELDS) {
    if (
      value.data[field] !== undefined &&
      typeof value.data[field] !== 'string'
    ) {
      throw new SpreadsheetApiTlqvByCodeInvalidResponseError(
        `data.${field} must be a string when present`,
      );
    }
  }

  return {
    rowNumber: Number(value.rowNumber),
    data: value.data as unknown as TlqvItemData,
  };
}

function normalizeRequiredTlqvCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === '') {
    throw new RangeError('tlqvCode is required');
  }

  const match = normalized.match(/TLQV-\d+/);
  return match?.[0] ?? normalized;
}

function isNotFoundAxiosError(error: unknown): error is {
  response: {
    status: 404;
    data?: unknown;
  };
} {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function buildRequestErrorDetail(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response !== undefined) {
      return `HTTP ${error.response.status} - ${stringifyErrorBody(
        error.response.data,
      )}`;
    }

    return [error.code, error.message].filter(Boolean).join(' - ');
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'unknown error';
}

function stringifyErrorBody(value: unknown): string {
  const serialized =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (_key, nestedValue: unknown) => {
          if (typeof nestedValue === 'bigint') {
            return nestedValue.toString();
          }

          return nestedValue;
        });

  if (serialized === undefined || serialized.trim() === '') {
    return 'empty response body';
  }

  return serialized.length > MAX_ERROR_BODY_LENGTH
    ? `${serialized.slice(0, MAX_ERROR_BODY_LENGTH)}...`
    : serialized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
