import axios, { type AxiosInstance } from 'axios';
import type { IGetMadreItemByTlqvCodeRepository } from '../../../../adapters/repositories/spreadsheet-api/madre/IGetMadreItemByTlqvCodeRepository';
import {
  MADRE_SHEET_NAME,
  type GetMadreItemByTlqvCodeCommand,
  type GetMadreItemByTlqvCodeResponse,
  type MadreItem,
  type MadreItemData,
  type MadreSpreadsheetCellValue,
} from '../../../../entities/spreadsheet-api/madre/MadreItems';

const DEFAULT_BASE_URL = 'https://spreadsheet.loquieroaca.com';
const DEFAULT_SPREADSHEET_NAME = 'prueba-lectura';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 10_000;
const MAX_ERROR_BODY_LENGTH = 500;

export interface GetMadreItemByTlqvCodeRepositoryOptions {
  baseUrl?: string;
  spreadsheetName?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class SpreadsheetApiMadreByTlqvRequestError extends Error {
  constructor(tlqvCode: string, detail: string) {
    super(
      `Spreadsheet API request failed for MADRE sheet item ${tlqvCode}: ${detail}`,
    );
    this.name = SpreadsheetApiMadreByTlqvRequestError.name;
  }
}

export class SpreadsheetApiMadreByTlqvInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Spreadsheet API returned an invalid MADRE item response: ${detail}`);
    this.name = SpreadsheetApiMadreByTlqvInvalidResponseError.name;
  }
}

export class GetMadreItemByTlqvCodeRepository implements IGetMadreItemByTlqvCodeRepository {
  private readonly httpClient: AxiosInstance;
  private readonly spreadsheetName: string;

  constructor(options: GetMadreItemByTlqvCodeRepositoryOptions = {}) {
    this.spreadsheetName = options.spreadsheetName ?? DEFAULT_SPREADSHEET_NAME;
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getByTlqvCode(
    command: GetMadreItemByTlqvCodeCommand,
  ): Promise<GetMadreItemByTlqvCodeResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);

    try {
      const response = await this.httpClient.get<unknown>(
        `/sheet/${encodeURIComponent(this.spreadsheetName)}/${MADRE_SHEET_NAME}/${encodeURIComponent(tlqvCode)}`,
      );
      const item = parseResponse(response.data, tlqvCode);

      return {
        found: true,
        tlqvCode,
        item,
      };
    } catch (error: unknown) {
      if (error instanceof SpreadsheetApiMadreByTlqvInvalidResponseError) {
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

      throw new SpreadsheetApiMadreByTlqvRequestError(
        tlqvCode,
        buildRequestErrorDetail(error),
      );
    }
  }
}

function parseResponse(value: unknown, expectedTlqvCode: string): MadreItem {
  if (!isRecord(value)) {
    throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
      'body must be an object',
    );
  }

  const item = parseItem(value);
  const responseTlqvCode = normalizeRequiredTlqvCode(item.data.Identificador);
  if (responseTlqvCode !== expectedTlqvCode) {
    throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
      `expected TLQV ${expectedTlqvCode}, received ${responseTlqvCode}`,
    );
  }

  return item;
}

function parseItem(value: unknown): MadreItem {
  if (!isRecord(value)) {
    throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
      'item must be an object',
    );
  }
  if (!Number.isInteger(value.rowNumber) || Number(value.rowNumber) < 1) {
    throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
      'rowNumber must be a positive integer',
    );
  }
  if (!isRecord(value.data)) {
    throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
      'data must be an object',
    );
  }
  if (
    typeof value.data.Identificador !== 'string' ||
    value.data.Identificador.trim() === ''
  ) {
    throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
      'data.Identificador must be a non-empty string',
    );
  }

  const data: MadreItemData = {
    Identificador: value.data.Identificador,
  };

  for (const [field, cellValue] of Object.entries(value.data)) {
    if (field === 'Identificador') {
      continue;
    }
    if (!isAllowedCellValue(cellValue)) {
      throw new SpreadsheetApiMadreByTlqvInvalidResponseError(
        `data.${field} must be a string, string array, number, boolean, null or undefined`,
      );
    }

    data[field] = cellValue;
  }

  return {
    rowNumber: Number(value.rowNumber),
    data,
  };
}

function isAllowedCellValue(
  value: unknown,
): value is MadreSpreadsheetCellValue | undefined {
  if (value === undefined || value === null) {
    return true;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
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
