import axios, { type AxiosInstance } from 'axios';
import type { IGetComprobantesByDateRepository } from '../../../adapters/repositories/xubio/comprobantes/IGetComprobantesByDateRepository';
import type {
  GetXubioComprobantesByDateCommand,
  GetXubioComprobantesByDateResponse,
} from '../../../entities/xubio/comprobantes/XubioComprobante';
import {
  parseComprobanteListItem,
  XubioComprobanteInvalidResponseError,
} from './XubioComprobanteParsers';
import {
  executeXubioRequestWithRetry,
  type XubioRequestRetryOptions,
} from '../XubioRequestRetry';

const DEFAULT_BASE_URL = 'https://xubio.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10_000;
const MINIMUM_PAGE_SIZE_TO_PROBE_NEXT_PAGE = 100;
const MAX_PAGES_PER_DATE_RANGE = 1_000;
const COMPROBANTE_VENTA_PATH = '/API/1.1/comprobanteVentaBean';

export interface GetComprobantesByDateRepositoryOptions {
  baseUrl?: string;
  authorizationToken?: string;
  accessTokenProvider?: () => Promise<string>;
  onAuthorizationFailure?: () => void | Promise<void>;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
  retryOptions?: XubioRequestRetryOptions;
}

export class XubioComprobantesByDateRequestError extends Error {
  constructor(fechaDesde: string, fechaHasta: string, detail?: string) {
    super(
      `Xubio request failed while getting comprobantes from ${fechaDesde} to ${fechaHasta}${detail === undefined ? '' : `: ${detail}`}`,
    );
    this.name = XubioComprobantesByDateRequestError.name;
  }
}

export class GetComprobantesByDateRepository implements IGetComprobantesByDateRepository {
  private readonly httpClient: AxiosInstance;
  private readonly authorizationToken?: string;
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly onAuthorizationFailure?: () => void | Promise<void>;
  private readonly retryOptions: XubioRequestRetryOptions;

  constructor(options: GetComprobantesByDateRepositoryOptions = {}) {
    this.authorizationToken = options.authorizationToken;
    this.accessTokenProvider = options.accessTokenProvider;
    this.onAuthorizationFailure = options.onAuthorizationFailure;
    this.retryOptions = options.retryOptions ?? {};
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
        headers: buildHeaders(options.authorizationToken),
      });
  }

  async getByDateRange(
    command: GetXubioComprobantesByDateCommand,
  ): Promise<GetXubioComprobantesByDateResponse> {
    validateDateRange(command.fechaDesde, command.fechaHasta);
    const limit = command.limit ?? DEFAULT_LIMIT;
    validateLimit(limit);

    try {
      const comprobantes: GetXubioComprobantesByDateResponse['comprobantes'] =
        [];
      const seenTransactionIds = new Set<number>();
      const seenCursorIds = new Set<number>();
      let lastTransactionId: number | undefined;
      let pageCount = 0;

      while (true) {
        pageCount += 1;
        if (pageCount > MAX_PAGES_PER_DATE_RANGE) {
          throw new XubioComprobanteInvalidResponseError(
            `pagination exceeded ${MAX_PAGES_PER_DATE_RANGE} pages`,
          );
        }

        const response = await executeXubioRequestWithRetry(
          async () =>
            this.httpClient.get<unknown>(COMPROBANTE_VENTA_PATH, {
              params: {
                fechaDesde: command.fechaDesde,
                fechaHasta: command.fechaHasta,
              },
              headers: {
                ...(await this.buildAuthorizationHeaders()),
                minimalVersion: 'true',
                limit,
                ...(lastTransactionId === undefined
                  ? {}
                  : { lastTransactionID: lastTransactionId }),
              },
            }),
          {
            ...this.retryOptions,
            onAuthorizationFailure: this.onAuthorizationFailure,
          },
        );

        if (!Array.isArray(response.data)) {
          throw new XubioComprobanteInvalidResponseError(
            'body must be an array',
          );
        }

        const page = response.data.map((item, index) =>
          parseComprobanteListItem(item, `comprobantes[${index}]`),
        );
        if (page.length === 0) {
          return {
            comprobantes,
            pages: pageCount,
            lastTransactionId: lastTransactionId ?? null,
          };
        }

        for (const comprobante of page) {
          if (!seenTransactionIds.has(comprobante.transaccionid)) {
            comprobantes.push(comprobante);
            seenTransactionIds.add(comprobante.transaccionid);
          }
        }

        const nextTransactionId = page[page.length - 1]?.transaccionid;
        if (nextTransactionId === undefined) {
          return {
            comprobantes,
            pages: pageCount,
            lastTransactionId: lastTransactionId ?? null,
          };
        }
        if (seenCursorIds.has(nextTransactionId)) {
          throw new XubioComprobanteInvalidResponseError(
            `pagination cursor did not advance after transaction ${nextTransactionId}`,
          );
        }

        seenCursorIds.add(nextTransactionId);
        lastTransactionId = nextTransactionId;

        if (
          page.length < Math.min(limit, MINIMUM_PAGE_SIZE_TO_PROBE_NEXT_PAGE)
        ) {
          return {
            comprobantes,
            pages: pageCount,
            lastTransactionId,
          };
        }
      }
    } catch (error: unknown) {
      if (error instanceof XubioComprobanteInvalidResponseError) {
        throw error;
      }
      throw buildRequestError(command.fechaDesde, command.fechaHasta, error);
    }
  }

  private async buildAuthorizationHeaders(): Promise<Record<string, string>> {
    if (this.accessTokenProvider !== undefined) {
      return {
        Authorization: `Bearer ${await this.accessTokenProvider()}`,
      };
    }

    if (
      this.authorizationToken !== undefined &&
      this.authorizationToken.trim() !== ''
    ) {
      return {
        Authorization: `Bearer ${this.authorizationToken}`,
      };
    }

    return {};
  }
}

function buildRequestError(
  fechaDesde: string,
  fechaHasta: string,
  error: unknown,
): XubioComprobantesByDateRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new XubioComprobantesByDateRequestError(
      fechaDesde,
      fechaHasta,
      detail,
    );
  }

  if (error instanceof Error) {
    return new XubioComprobantesByDateRequestError(
      fechaDesde,
      fechaHasta,
      error.message,
    );
  }

  return new XubioComprobantesByDateRequestError(
    fechaDesde,
    fechaHasta,
    'unknown error',
  );
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

function buildHeaders(
  authorizationToken: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (authorizationToken !== undefined && authorizationToken.trim() !== '') {
    headers.Authorization = `Bearer ${authorizationToken}`;
  }

  return headers;
}

function validateDateRange(fechaDesde: string, fechaHasta: string): void {
  validateIsoDate(fechaDesde, 'fechaDesde');
  validateIsoDate(fechaHasta, 'fechaHasta');

  if (fechaDesde > fechaHasta) {
    throw new RangeError('fechaDesde cannot be greater than fechaHasta');
  }
}

function validateIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${field} must use YYYY-MM-DD format`);
  }
}

function validateLimit(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
}
