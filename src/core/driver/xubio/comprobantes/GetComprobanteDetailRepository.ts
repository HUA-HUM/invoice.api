import axios, { type AxiosInstance } from 'axios';
import type { IGetComprobanteDetailRepository } from '../../../adapters/repositories/xubio/comprobantes/IGetComprobanteDetailRepository';
import type {
  GetXubioComprobanteDetailCommand,
  GetXubioComprobanteDetailResponse,
} from '../../../entities/xubio/comprobantes/XubioComprobante';
import {
  parseComprobanteDetail,
  XubioComprobanteInvalidResponseError,
} from './XubioComprobanteParsers';
import {
  executeXubioRequestWithRetry,
  type XubioRequestRetryOptions,
} from '../XubioRequestRetry';

const DEFAULT_BASE_URL = 'https://xubio.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const COMPROBANTE_VENTA_PATH = '/API/1.1/comprobanteVentaBean';

export interface GetComprobanteDetailRepositoryOptions {
  baseUrl?: string;
  authorizationToken?: string;
  accessTokenProvider?: () => Promise<string>;
  onAuthorizationFailure?: () => void | Promise<void>;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
  retryOptions?: XubioRequestRetryOptions;
}

export class XubioComprobanteDetailRequestError extends Error {
  constructor(transaccionId: number, detail?: string) {
    super(
      `Xubio request failed while getting comprobante detail ${transaccionId}${detail === undefined ? '' : `: ${detail}`}`,
    );
    this.name = XubioComprobanteDetailRequestError.name;
  }
}

export class GetComprobanteDetailRepository implements IGetComprobanteDetailRepository {
  private readonly httpClient: AxiosInstance;
  private readonly authorizationToken?: string;
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly onAuthorizationFailure?: () => void | Promise<void>;
  private readonly retryOptions: XubioRequestRetryOptions;

  constructor(options: GetComprobanteDetailRepositoryOptions = {}) {
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

  async getDetail(
    command: GetXubioComprobanteDetailCommand,
  ): Promise<GetXubioComprobanteDetailResponse> {
    validateTransactionId(command.transaccionId);

    try {
      const response = await executeXubioRequestWithRetry(
        async () =>
          this.httpClient.get<unknown>(
            `${COMPROBANTE_VENTA_PATH}/${encodeURIComponent(command.transaccionId)}`,
            {
              headers: await this.buildAuthorizationHeaders(),
            },
          ),
        {
          ...this.retryOptions,
          onAuthorizationFailure: this.onAuthorizationFailure,
        },
      );

      return {
        comprobante: parseComprobanteDetail(response.data),
      };
    } catch (error: unknown) {
      if (error instanceof XubioComprobanteInvalidResponseError) {
        throw error;
      }
      throw buildRequestError(command.transaccionId, error);
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
  transaccionId: number,
  error: unknown,
): XubioComprobanteDetailRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new XubioComprobanteDetailRequestError(transaccionId, detail);
  }

  if (error instanceof Error) {
    return new XubioComprobanteDetailRequestError(transaccionId, error.message);
  }

  return new XubioComprobanteDetailRequestError(transaccionId, 'unknown error');
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

function validateTransactionId(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('transaccionId must be a positive integer');
  }
}
