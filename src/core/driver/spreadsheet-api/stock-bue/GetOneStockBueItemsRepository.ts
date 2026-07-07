import axios, { type AxiosInstance } from 'axios';
import type { IGetOneStockBueItemsRepository } from '../../../adapters/repositories/spreadsheet-api/stock-bue/IGetOneStockBueItemsRepository';
import {
  STOCK_BUE_SHEET_SLUG,
  type GetOneStockBueItemsCommand,
  type GetOneStockBueItemsResponse,
  type StockBueItem,
  type StockBueItemData,
} from '../../../entities/spreadsheet-api/stock-bue/StockBueItems';

const DEFAULT_BASE_URL = 'https://spreadsheet.loquieroaca.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 10_000;

export interface GetOneStockBueItemsRepositoryOptions {
  baseUrl?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class StockBueSpreadsheetApiRequestError extends Error {
  constructor(page: number) {
    super(`Spreadsheet API request failed for stock-bue page ${page}`);
    this.name = StockBueSpreadsheetApiRequestError.name;
  }
}

export class StockBueSpreadsheetApiInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Spreadsheet API returned an invalid stock-bue response: ${detail}`);
    this.name = StockBueSpreadsheetApiInvalidResponseError.name;
  }
}

export class GetOneStockBueItemsRepository implements IGetOneStockBueItemsRepository {
  private readonly httpClient: AxiosInstance;

  constructor(options: GetOneStockBueItemsRepositoryOptions = {}) {
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getOne(
    command: GetOneStockBueItemsCommand,
  ): Promise<GetOneStockBueItemsResponse> {
    validatePositiveInteger(command.page, 'page');
    validatePositiveInteger(command.pageSize, 'pageSize');

    try {
      const response = await this.httpClient.get<unknown>(
        `/sheet/${STOCK_BUE_SHEET_SLUG}`,
        {
          params: {
            page: command.page,
            pageSize: command.pageSize,
          },
        },
      );
      const result = parseResponse(response.data);

      if (result.page !== command.page) {
        throw new StockBueSpreadsheetApiInvalidResponseError(
          `expected page ${command.page}, received ${result.page}`,
        );
      }
      if (result.pageSize !== command.pageSize) {
        throw new StockBueSpreadsheetApiInvalidResponseError(
          `expected pageSize ${command.pageSize}, received ${result.pageSize}`,
        );
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof StockBueSpreadsheetApiInvalidResponseError) {
        throw error;
      }
      throw new StockBueSpreadsheetApiRequestError(command.page);
    }
  }
}

function parseResponse(value: unknown): GetOneStockBueItemsResponse {
  if (!isRecord(value)) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      'body must be an object',
    );
  }

  const page = readPositiveInteger(value, 'page');
  const pageSize = readPositiveInteger(value, 'pageSize');
  const totalRows = readNonNegativeInteger(value, 'totalRows');
  const totalPages = readNonNegativeInteger(value, 'totalPages');
  const hasNextPage = readBoolean(value, 'hasNextPage');
  const hasPreviousPage = readBoolean(value, 'hasPreviousPage');

  if (!Array.isArray(value.rows)) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      'rows must be an array',
    );
  }

  const rows = value.rows.map(parseItem);

  if (rows.length > pageSize) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      'rows cannot contain more elements than pageSize',
    );
  }

  return {
    page,
    pageSize,
    totalRows,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    rows,
  };
}

function parseItem(value: unknown, index: number): StockBueItem {
  if (!isRecord(value)) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      `rows[${index}] must be an object`,
    );
  }
  if (!Number.isInteger(value.rowNumber) || Number(value.rowNumber) < 1) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      `rows[${index}].rowNumber must be a positive integer`,
    );
  }
  if (!isRecord(value.data)) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      `rows[${index}].data must be an object`,
    );
  }

  return {
    rowNumber: Number(value.rowNumber),
    data: parseItemData(value.data, index),
  };
}

function parseItemData(
  value: Record<string, unknown>,
  index: number,
): StockBueItemData {
  const data: StockBueItemData = {};

  for (const [field, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined || fieldValue === null) {
      data[field] = undefined;
      continue;
    }
    if (typeof fieldValue !== 'string') {
      throw new StockBueSpreadsheetApiInvalidResponseError(
        `rows[${index}].data.${field} must be a string`,
      );
    }
    data[field] = fieldValue;
  }

  return data;
}

function readPositiveInteger(
  source: Record<string, unknown>,
  field: string,
): number {
  const value = readNonNegativeInteger(source, field);
  if (value < 1) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      `${field} must be a positive integer`,
    );
  }
  return value;
}

function readNonNegativeInteger(
  source: Record<string, unknown>,
  field: string,
): number {
  const value = source[field];
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      `${field} must be a non-negative integer`,
    );
  }
  return Number(value);
}

function readBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new StockBueSpreadsheetApiInvalidResponseError(
      `${field} must be a boolean`,
    );
  }
  return value;
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
