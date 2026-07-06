import axios, { type AxiosInstance } from 'axios';
import type { IGetAccessTokenRepository } from '../../../adapters/repositories/xubio/auth/IGetAccessTokenRepository';
import type {
  GetXubioAccessTokenCommand,
  GetXubioAccessTokenResponse,
} from '../../../entities/xubio/auth/XubioToken';
import {
  executeXubioRequestWithRetry,
  type XubioRequestRetryOptions,
} from '../XubioRequestRetry';

const DEFAULT_BASE_URL = 'https://xubio.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 15_000;
const TOKEN_ENDPOINT_PATH = '/API/1.1/TokenEndpoint';
const DEFAULT_GRANT_TYPE = 'client_credentials';

export interface GetAccessTokenRepositoryOptions {
  baseUrl?: string;
  basicAuthorizationToken: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
  retryOptions?: XubioRequestRetryOptions;
}

export class XubioAccessTokenRequestError extends Error {
  constructor(detail?: string) {
    super(
      `Xubio request failed while getting access token${detail === undefined ? '' : `: ${detail}`}`,
    );
    this.name = XubioAccessTokenRequestError.name;
  }
}

export class XubioAccessTokenInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Xubio returned an invalid access token response: ${detail}`);
    this.name = XubioAccessTokenInvalidResponseError.name;
  }
}

export class GetAccessTokenRepository implements IGetAccessTokenRepository {
  private readonly httpClient: AxiosInstance;
  private readonly authorizationHeaderValue: string;
  private readonly retryOptions: XubioRequestRetryOptions;

  constructor(options: GetAccessTokenRepositoryOptions) {
    if (options.basicAuthorizationToken.trim() === '') {
      throw new RangeError('basicAuthorizationToken cannot be empty');
    }

    this.authorizationHeaderValue = buildBasicAuthorizationHeaderValue(
      options.basicAuthorizationToken,
    );
    this.retryOptions = options.retryOptions ?? {};
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getAccessToken(
    command: GetXubioAccessTokenCommand = {},
  ): Promise<GetXubioAccessTokenResponse> {
    const grantType = command.grantType ?? DEFAULT_GRANT_TYPE;

    try {
      const response = await executeXubioRequestWithRetry(
        () =>
          this.httpClient.post<unknown>(
            TOKEN_ENDPOINT_PATH,
            new URLSearchParams({
              grant_type: grantType,
            }).toString(),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: this.authorizationHeaderValue,
              },
            },
          ),
        this.retryOptions,
      );

      return parseTokenResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof XubioAccessTokenInvalidResponseError) {
        throw error;
      }
      throw buildRequestError(error);
    }
  }
}

function buildRequestError(error: unknown): XubioAccessTokenRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new XubioAccessTokenRequestError(detail);
  }

  if (error instanceof Error) {
    return new XubioAccessTokenRequestError(error.message);
  }

  return new XubioAccessTokenRequestError('unknown error');
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

function buildBasicAuthorizationHeaderValue(basicToken: string): string {
  const trimmed = basicToken.trim();

  if (trimmed.toLowerCase().startsWith('basic ')) {
    return trimmed;
  }

  return `Basic ${trimmed}`;
}

function parseTokenResponse(value: unknown): GetXubioAccessTokenResponse {
  if (!isRecord(value)) {
    throw new XubioAccessTokenInvalidResponseError('body must be an object');
  }

  return {
    accessToken: readString(value, 'access_token'),
    tokenType: readOptionalString(value, 'token_type') ?? 'Bearer',
    expiresIn: readOptionalNumber(value, 'expires_in'),
    rawPayload: value,
  };
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new XubioAccessTokenInvalidResponseError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function readOptionalString(
  source: Record<string, unknown>,
  field: string,
): string | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new XubioAccessTokenInvalidResponseError(
      `${field} must be a non-empty string, null or undefined`,
    );
  }
  return value;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  field: string,
): number | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioAccessTokenInvalidResponseError(
      `${field} must be a number, numeric string, null or undefined`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
