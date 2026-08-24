import axios, { type AxiosInstance } from 'axios';
import type { IGetCostosOperacionesByTlqvCodeRepository } from '../../../../adapters/repositories/spreadsheet-api/costos-operaciones/IGetCostosOperacionesByTlqvCodeRepository';
import {
  COSTOS_OPERACIONES_SHEET_SLUG,
  type CostosOperacionesItem,
  type CostosOperacionesItemData,
  type GetCostosOperacionesByTlqvCodeCommand,
  type GetCostosOperacionesByTlqvCodeResponse,
} from '../../../../entities/spreadsheet-api/costos-operaciones/CostosOperaciones';

const DEFAULT_BASE_URL = 'https://spreadsheet.loquieroaca.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 10_000;
const MAX_ERROR_BODY_LENGTH = 500;

export interface GetCostosOperacionesByTlqvCodeRepositoryOptions {
  baseUrl?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class CostosOperacionesSpreadsheetApiByTlqvCodeRequestError extends Error {
  constructor(tlqvCode: string, detail: string) {
    super(
      `Spreadsheet API request failed for costos-operaciones item ${tlqvCode}: ${detail}`,
    );
    this.name = CostosOperacionesSpreadsheetApiByTlqvCodeRequestError.name;
  }
}

export class CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError extends Error {
  constructor(detail: string) {
    super(
      `Spreadsheet API returned an invalid costos-operaciones item response: ${detail}`,
    );
    this.name =
      CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError.name;
  }
}

export class GetCostosOperacionesByTlqvCodeRepository implements IGetCostosOperacionesByTlqvCodeRepository {
  private readonly httpClient: AxiosInstance;

  constructor(options: GetCostosOperacionesByTlqvCodeRepositoryOptions = {}) {
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getByTlqvCode(
    command: GetCostosOperacionesByTlqvCodeCommand,
  ): Promise<GetCostosOperacionesByTlqvCodeResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);

    try {
      const response = await this.httpClient.get<unknown>(
        `/sheet/${COSTOS_OPERACIONES_SHEET_SLUG}/${encodeURIComponent(tlqvCode)}`,
      );
      const item = parseResponse(response.data, tlqvCode);

      return {
        found: true,
        tlqvCode,
        item,
      };
    } catch (error: unknown) {
      if (
        error instanceof
        CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError
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

      throw new CostosOperacionesSpreadsheetApiByTlqvCodeRequestError(
        tlqvCode,
        buildRequestErrorDetail(error),
      );
    }
  }
}

function parseResponse(
  value: unknown,
  expectedTlqvCode: string,
): CostosOperacionesItem {
  if (!isRecord(value)) {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'body must be an object',
    );
  }

  const item = parseItem(value);
  const responseTlqvCode = normalizeRequiredTlqvCode(item.data.OPERACIÓN);
  if (responseTlqvCode !== expectedTlqvCode) {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      `expected TLQV ${expectedTlqvCode}, received ${responseTlqvCode}`,
    );
  }

  return item;
}

function parseItem(value: unknown): CostosOperacionesItem {
  if (!isRecord(value)) {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'item must be an object',
    );
  }
  if (!Number.isInteger(value.rowNumber) || Number(value.rowNumber) < 1) {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'rowNumber must be a positive integer',
    );
  }
  if (!isRecord(value.data)) {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'data must be an object',
    );
  }

  return {
    rowNumber: Number(value.rowNumber),
    data: parseItemData(value.data),
  };
}

function parseItemData(
  value: Record<string, unknown>,
): CostosOperacionesItemData {
  const data: CostosOperacionesItemData = {};

  for (const [field, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined || fieldValue === null) {
      data[field] = undefined;
      continue;
    }
    if (typeof fieldValue !== 'string') {
      throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
        `data.${field} must be a string`,
      );
    }
    data[field] = fieldValue;
  }

  if (typeof data.OPERACIÓN !== 'string' || data.OPERACIÓN.trim() === '') {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'data.OPERACIÓN must be a non-empty string',
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
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'tlqvCode must be a string',
    );
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/TLQV-\d+/);
  const tlqvCode = match?.[0] ?? normalized;

  if (tlqvCode === '') {
    throw new CostosOperacionesSpreadsheetApiByTlqvCodeInvalidResponseError(
      'tlqvCode is required',
    );
  }

  return tlqvCode;
}
