import axios, { type AxiosInstance } from 'axios';
import type { IGetTlqvOrderDetailsRepository } from '../../../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type {
  GetTlqvOrderDetailsCommand,
  GetTlqvOrderDetailsResponse,
  TlqvOrderBuyerData,
  TlqvOrderDetails,
} from '../../../../entities/tlqv/order-details/TlqvOrderDetails';

const DEFAULT_BASE_URL = 'https://ops.api.loquieroaca.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const ORDER_DETAILS_PATH = '/api/order-details';
const SOURCE = 'ops_api';

export interface GetOpsApiTlqvOrderDetailsRepositoryOptions {
  baseUrl?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class OpsApiTlqvOrderDetailsRequestError extends Error {
  constructor(tlqvCode: string, detail: string) {
    super(
      `Ops API request failed while getting order details ${tlqvCode}: ${detail}`,
    );
    this.name = OpsApiTlqvOrderDetailsRequestError.name;
  }
}

export class OpsApiTlqvOrderDetailsInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Ops API returned an invalid order details response: ${detail}`);
    this.name = OpsApiTlqvOrderDetailsInvalidResponseError.name;
  }
}

export class GetOpsApiTlqvOrderDetailsRepository implements IGetTlqvOrderDetailsRepository {
  private readonly httpClient: AxiosInstance;

  constructor(options: GetOpsApiTlqvOrderDetailsRepositoryOptions = {}) {
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
        headers: {
          Accept: 'application/json',
        },
      });
  }

  async getByTlqvCode(
    command: GetTlqvOrderDetailsCommand,
  ): Promise<GetTlqvOrderDetailsResponse> {
    const tlqvCode = normalizeTlqvCode(command.tlqvCode);

    try {
      const response = await this.httpClient.get<unknown>(ORDER_DETAILS_PATH, {
        params: {
          tlqtNumber: tlqvCode,
        },
      });

      return parseOrderDetailsResponse(response.data, tlqvCode);
    } catch (error: unknown) {
      if (isNotFoundAxiosError(error)) {
        return {
          found: false,
          tlqvCode,
          source: SOURCE,
          reason: 'not_found',
          rawPayload: error.response?.data,
        };
      }

      if (error instanceof OpsApiTlqvOrderDetailsInvalidResponseError) {
        throw error;
      }

      throw buildRequestError(tlqvCode, error);
    }
  }
}

function parseOrderDetailsResponse(
  value: unknown,
  expectedTlqvCode: string,
): GetTlqvOrderDetailsResponse {
  if (!isRecord(value)) {
    throw new OpsApiTlqvOrderDetailsInvalidResponseError(
      'body must be an object',
    );
  }

  if (isNotFoundStatus(value.status)) {
    return {
      found: false,
      tlqvCode: expectedTlqvCode,
      source: SOURCE,
      reason: String(value.status),
      rawPayload: value,
    };
  }

  if (value.status !== 'success') {
    throw new OpsApiTlqvOrderDetailsInvalidResponseError(
      `status must be success, received ${String(value.status)}`,
    );
  }

  if (!isRecord(value.sale)) {
    return {
      found: false,
      tlqvCode: expectedTlqvCode,
      source: SOURCE,
      reason: 'missing_sale',
      rawPayload: value,
    };
  }

  const tlqvCode = readOptionalString(value.sale, 'tlqtNumber');
  if (tlqvCode !== null && normalizeTlqvCode(tlqvCode) !== expectedTlqvCode) {
    throw new OpsApiTlqvOrderDetailsInvalidResponseError(
      `expected tlqtNumber ${expectedTlqvCode}, received ${tlqvCode}`,
    );
  }

  const customer = isRecord(value.sale.customer) ? value.sale.customer : {};
  const address = isRecord(customer.address) ? customer.address : {};
  const buyerCuit = readOptionalString(customer, 'buyerCuit');
  const shippingCuit = readOptionalString(customer, 'shippingCuit');
  const buyerData: TlqvOrderBuyerData = {
    cuitComprador: buyerCuit,
    cuitCompradorDigits: normalizeDigits(buyerCuit),
    cuitEnvio: shippingCuit,
    cuitEnvioDigits: normalizeDigits(shippingCuit),
    nombreDestinatario: readOptionalString(customer, 'recipientName'),
    telefono:
      readOptionalString(customer, 'canonicalPhone') ??
      readOptionalString(customer, 'phone') ??
      readOptionalString(customer, 'legacyPhone'),
    direccion: normalizeAddress(readOptionalString(address, 'raw')),
    ciudad: readOptionalString(address, 'city'),
    provincia: readOptionalString(address, 'province'),
    codigoPostal: readOptionalString(address, 'postalCode'),
    email: readOptionalString(customer, 'email'),
  };

  const orderDetails: TlqvOrderDetails = {
    tlqvCode: expectedTlqvCode,
    source: SOURCE,
    saleNumber: readOptionalString(value.sale, 'saleNumber'),
    buyerData,
    rawPayload: value,
  };

  return {
    found: true,
    orderDetails,
  };
}

function buildRequestError(
  tlqvCode: string,
  error: unknown,
): OpsApiTlqvOrderDetailsRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new OpsApiTlqvOrderDetailsRequestError(tlqvCode, detail);
  }

  if (error instanceof Error) {
    return new OpsApiTlqvOrderDetailsRequestError(tlqvCode, error.message);
  }

  return new OpsApiTlqvOrderDetailsRequestError(tlqvCode, 'unknown error');
}

function isNotFoundAxiosError(
  error: unknown,
): error is { response?: { status?: number; data?: unknown } } {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function isNotFoundStatus(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === 'not_found' || normalizedValue === 'not found';
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

function normalizeTlqvCode(value: string): string {
  const normalizedValue = value.trim().toUpperCase();
  if (normalizedValue === '') {
    throw new RangeError('tlqvCode is required');
  }

  return normalizedValue;
}

function readOptionalString(
  source: Record<string, unknown>,
  field: string,
): string | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    throw new OpsApiTlqvOrderDetailsInvalidResponseError(
      `${field} must be a string, number, null or undefined`,
    );
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function normalizeDigits(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
}

function normalizeAddress(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  return normalizedValue === '' ? null : normalizedValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
