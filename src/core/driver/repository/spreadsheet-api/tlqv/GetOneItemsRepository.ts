import axios, { type AxiosInstance } from 'axios';
import type { IGetOneItemsRepository } from '../../../../adapters/repositories/spreadsheet-api/tlqv/IGetOneItemsRepository';
import {
  TLQV_SHEET_NAME,
  type GetOneTlqvItemsCommand,
  type GetOneTlqvItemsResponse,
  type TlqvItem,
  type TlqvItemData,
} from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';

const DEFAULT_BASE_URL = 'https://spreadsheet.loquieroaca.com';
const DEFAULT_SPREADSHEET_NAME = 'prueba-lectura';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 10_000;

const TLQV_ITEM_FIELDS = [
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

export interface GetOneItemsRepositoryOptions {
  baseUrl?: string;
  spreadsheetName?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class SpreadsheetApiRequestError extends Error {
  constructor(page: number) {
    super(`Spreadsheet API request failed for TLQV page ${page}`);
    this.name = SpreadsheetApiRequestError.name;
  }
}

export class SpreadsheetApiInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Spreadsheet API returned an invalid TLQV response: ${detail}`);
    this.name = SpreadsheetApiInvalidResponseError.name;
  }
}

export class GetOneItemsRepository implements IGetOneItemsRepository {
  private readonly httpClient: AxiosInstance;
  private readonly spreadsheetName: string;

  constructor(options: GetOneItemsRepositoryOptions = {}) {
    this.spreadsheetName = options.spreadsheetName ?? DEFAULT_SPREADSHEET_NAME;
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getOne(
    command: GetOneTlqvItemsCommand,
  ): Promise<GetOneTlqvItemsResponse> {
    validatePositiveInteger(command.page, 'page');
    validatePositiveInteger(command.pageSize, 'pageSize');

    try {
      const response = await this.httpClient.get<unknown>(this.getPath(), {
        params: {
          page: command.page,
          pageSize: command.pageSize,
        },
      });
      const result = parseResponse(response.data);

      if (result.page !== command.page) {
        throw new SpreadsheetApiInvalidResponseError(
          `expected page ${command.page}, received ${result.page}`,
        );
      }
      if (result.pageSize !== command.pageSize) {
        throw new SpreadsheetApiInvalidResponseError(
          `expected pageSize ${command.pageSize}, received ${result.pageSize}`,
        );
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof SpreadsheetApiInvalidResponseError) {
        throw error;
      }
      throw new SpreadsheetApiRequestError(command.page);
    }
  }

  private getPath(): string {
    return `/sheet/${encodeURIComponent(this.spreadsheetName)}/${TLQV_SHEET_NAME}`;
  }
}

function parseResponse(value: unknown): GetOneTlqvItemsResponse {
  if (!isRecord(value)) {
    throw new SpreadsheetApiInvalidResponseError('body must be an object');
  }

  const page = readPositiveInteger(value, 'page');
  const pageSize = readPositiveInteger(value, 'pageSize');
  const totalRows = readNonNegativeInteger(value, 'totalRows');
  const totalPages = readNonNegativeInteger(value, 'totalPages');
  const hasNextPage = readBoolean(value, 'hasNextPage');
  const hasPreviousPage = readBoolean(value, 'hasPreviousPage');

  if (value.sheetName !== TLQV_SHEET_NAME) {
    throw new SpreadsheetApiInvalidResponseError(
      `sheetName must be ${TLQV_SHEET_NAME}`,
    );
  }
  if (!Array.isArray(value.rows)) {
    throw new SpreadsheetApiInvalidResponseError('rows must be an array');
  }

  const rows = value.rows.map(parseItem);

  if (rows.length > pageSize) {
    throw new SpreadsheetApiInvalidResponseError(
      'rows cannot contain more elements than pageSize',
    );
  }

  return {
    page,
    pageSize,
    sheetName: TLQV_SHEET_NAME,
    totalRows,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    rows,
  };
}

function parseItem(value: unknown, index: number): TlqvItem {
  if (!isRecord(value)) {
    throw new SpreadsheetApiInvalidResponseError(
      `rows[${index}] must be an object`,
    );
  }
  if (!Number.isInteger(value.rowNumber) || Number(value.rowNumber) < 1) {
    throw new SpreadsheetApiInvalidResponseError(
      `rows[${index}].rowNumber must be a positive integer`,
    );
  }
  if (!isRecord(value.data)) {
    throw new SpreadsheetApiInvalidResponseError(
      `rows[${index}].data must be an object`,
    );
  }

  for (const field of TLQV_ITEM_FIELDS) {
    if (typeof value.data[field] !== 'string') {
      throw new SpreadsheetApiInvalidResponseError(
        `rows[${index}].data.${field} must be a string`,
      );
    }
  }

  return {
    rowNumber: Number(value.rowNumber),
    data: value.data as unknown as TlqvItemData,
  };
}

function readPositiveInteger(
  source: Record<string, unknown>,
  field: string,
): number {
  const value = readNonNegativeInteger(source, field);
  if (value < 1) {
    throw new SpreadsheetApiInvalidResponseError(
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
    throw new SpreadsheetApiInvalidResponseError(
      `${field} must be a non-negative integer`,
    );
  }
  return Number(value);
}

function readBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new SpreadsheetApiInvalidResponseError(`${field} must be a boolean`);
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
