import axios, { type AxiosInstance } from 'axios';
import type { IGetStockBueItemByTlqvCodeRepository } from '../../../../adapters/repositories/spreadsheet-api/stock-bue/IGetStockBueItemByTlqvCodeRepository';
import {
  STOCK_BUE_SHEET_SLUG,
  type GetStockBueItemByTlqvCodeCommand,
  type GetStockBueItemByTlqvCodeResponse,
  type StockBueItem,
  type StockBueItemData,
} from '../../../../entities/spreadsheet-api/stock-bue/StockBueItems';

const DEFAULT_BASE_URL = 'https://spreadsheet.loquieroaca.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 10_000;
const MAX_ERROR_BODY_LENGTH = 500;

export interface GetStockBueItemByTlqvCodeRepositoryOptions {
  baseUrl?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class StockBueSpreadsheetApiByTlqvCodeRequestError extends Error {
  constructor(tlqvCode: string, detail: string) {
    super(
      `Spreadsheet API request failed for stock-bue item ${tlqvCode}: ${detail}`,
    );
    this.name = StockBueSpreadsheetApiByTlqvCodeRequestError.name;
  }
}

export class StockBueSpreadsheetApiByTlqvCodeInvalidResponseError extends Error {
  constructor(detail: string) {
    super(
      `Spreadsheet API returned an invalid stock-bue item response: ${detail}`,
    );
    this.name = StockBueSpreadsheetApiByTlqvCodeInvalidResponseError.name;
  }
}

export class GetStockBueItemByTlqvCodeRepository implements IGetStockBueItemByTlqvCodeRepository {
  private readonly httpClient: AxiosInstance;

  constructor(options: GetStockBueItemByTlqvCodeRepositoryOptions = {}) {
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getByTlqvCode(
    command: GetStockBueItemByTlqvCodeCommand,
  ): Promise<GetStockBueItemByTlqvCodeResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);

    try {
      const response = await this.httpClient.get<unknown>(
        `/sheet/${STOCK_BUE_SHEET_SLUG}/${encodeURIComponent(tlqvCode)}`,
      );
      const item = parseResponse(response.data, tlqvCode);

      return {
        found: true,
        tlqvCode,
        item,
      };
    } catch (error: unknown) {
      if (
        error instanceof StockBueSpreadsheetApiByTlqvCodeInvalidResponseError
      ) {
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

      throw new StockBueSpreadsheetApiByTlqvCodeRequestError(
        tlqvCode,
        buildRequestErrorDetail(error),
      );
    }
  }
}

function parseResponse(value: unknown, expectedTlqvCode: string): StockBueItem {
  if (!isRecord(value)) {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'body must be an object',
    );
  }

  const item = parseItem(value);
  const responseTlqvCode = normalizeRequiredTlqvCode(item.data.TLQV);
  if (responseTlqvCode !== expectedTlqvCode) {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      `expected TLQV ${expectedTlqvCode}, received ${responseTlqvCode}`,
    );
  }

  return item;
}

function parseItem(value: unknown): StockBueItem {
  if (!isRecord(value)) {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'item must be an object',
    );
  }
  if (!Number.isInteger(value.rowNumber) || Number(value.rowNumber) < 1) {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'rowNumber must be a positive integer',
    );
  }
  if (!isRecord(value.data)) {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'data must be an object',
    );
  }

  return {
    rowNumber: Number(value.rowNumber),
    data: parseItemData(value.data),
  };
}

function parseItemData(value: Record<string, unknown>): StockBueItemData {
  const data: StockBueItemData = {};

  for (const [field, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined || fieldValue === null) {
      data[field] = undefined;
      continue;
    }
    if (typeof fieldValue !== 'string') {
      throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
        `data.${field} must be a string`,
      );
    }
    data[field] = fieldValue;
  }

  if (typeof data.TLQV !== 'string' || data.TLQV.trim() === '') {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'data.TLQV must be a non-empty string',
    );
  }

  return data;
}

function isNotFoundAxiosError(
  error: unknown,
): error is { response: { status: 404; data: unknown } } {
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

function normalizeRequiredTlqvCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'tlqvCode must be a string',
    );
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/TLQV-\d+/);
  const tlqvCode = match?.[0] ?? normalized;

  if (tlqvCode === '') {
    throw new StockBueSpreadsheetApiByTlqvCodeInvalidResponseError(
      'tlqvCode is required',
    );
  }

  return tlqvCode;
}
