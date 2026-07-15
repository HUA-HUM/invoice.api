import axios, { type AxiosInstance } from 'axios';
import type { IGetDetailsSkuRepository } from '../../../../adapters/repositories/catalog-sync-api/GetDetailsSku/IGetDetailsSkuRepository';
import type {
  CatalogSyncSkuProductDetails,
  GetCatalogSyncSkuDetailsCommand,
  GetCatalogSyncSkuDetailsResponse,
} from '../../../../entities/catalog-sync-api/GetDetailsSku/CatalogSyncSkuDetails';

const DEFAULT_BASE_URL = 'https://catalog-meli.loquieroaca.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const PRODUCT_PERFORMANCE_PATH = '/analytics/products/performance';

export interface GetDetailsSkuRepositoryOptions {
  baseUrl?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class CatalogSyncSkuDetailsRequestError extends Error {
  constructor(sku: string, detail: string) {
    super(
      `Catalog Sync API request failed while getting SKU details ${sku}: ${detail}`,
    );
    this.name = CatalogSyncSkuDetailsRequestError.name;
  }
}

export class CatalogSyncSkuDetailsInvalidResponseError extends Error {
  constructor(detail: string) {
    super(
      `Catalog Sync API returned an invalid SKU details response: ${detail}`,
    );
    this.name = CatalogSyncSkuDetailsInvalidResponseError.name;
  }
}

export class GetDetailsSkuRepository implements IGetDetailsSkuRepository {
  private readonly httpClient: AxiosInstance;

  constructor(options: GetDetailsSkuRepositoryOptions = {}) {
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

  async getDetailsBySku(
    command: GetCatalogSyncSkuDetailsCommand,
  ): Promise<GetCatalogSyncSkuDetailsResponse> {
    const sku = normalizeSku(command.sku);

    try {
      const response = await this.httpClient.get<unknown>(
        PRODUCT_PERFORMANCE_PATH,
        {
          params: {
            sku,
          },
        },
      );

      return parseSkuDetailsResponse(response.data, sku);
    } catch (error: unknown) {
      if (error instanceof CatalogSyncSkuDetailsInvalidResponseError) {
        throw error;
      }
      throw buildRequestError(sku, error);
    }
  }
}

function parseSkuDetailsResponse(
  value: unknown,
  expectedSku: string,
): GetCatalogSyncSkuDetailsResponse {
  if (!isRecord(value)) {
    throw new CatalogSyncSkuDetailsInvalidResponseError(
      'body must be an object',
    );
  }

  const rawProducts = value.products;
  if (!Array.isArray(rawProducts)) {
    throw new CatalogSyncSkuDetailsInvalidResponseError(
      'products must be an array',
    );
  }

  const rawProduct = rawProducts.find(
    (product) =>
      isRecord(product) &&
      readOptionalString(product, 'sku')?.toUpperCase() === expectedSku,
  );
  if (rawProduct === undefined) {
    return {
      found: false,
      sku: expectedSku,
      rawPayload: value,
    };
  }

  return {
    found: true,
    productDetails: parseProductDetails(rawProduct, expectedSku),
  };
}

function parseProductDetails(
  value: unknown,
  expectedSku: string,
): CatalogSyncSkuProductDetails {
  if (!isRecord(value)) {
    throw new CatalogSyncSkuDetailsInvalidResponseError(
      'product must be an object',
    );
  }

  return {
    sku: expectedSku,
    sellerId: readOptionalString(value, 'seller_id'),
    itemId: readOptionalString(value, 'item_id'),
    title: readOptionalString(value, 'title'),
    brand: readOptionalString(value, 'brand'),
    categoryId: readOptionalString(value, 'category_id'),
    domainId: readOptionalString(value, 'domain_id'),
    status: readOptionalString(value, 'status'),
    condition: readOptionalString(value, 'condition'),
    price: readOptionalNumber(value, 'price'),
    currencyId: readOptionalString(value, 'currency_id'),
    stock: readOptionalNumber(value, 'stock'),
    availableQuantity: readOptionalNumber(value, 'available_quantity'),
    catalogSoldQuantity: readOptionalNumber(value, 'catalog_sold_quantity'),
    permalink: readOptionalString(value, 'permalink'),
    thumbnail: readOptionalString(value, 'thumbnail'),
    rawPayload: value,
  };
}

function normalizeSku(value: string): string {
  const sku = value.trim().toUpperCase();
  if (sku === '') {
    throw new RangeError('sku is required');
  }
  return sku;
}

function buildRequestError(
  sku: string,
  error: unknown,
): CatalogSyncSkuDetailsRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new CatalogSyncSkuDetailsRequestError(sku, detail);
  }

  if (error instanceof Error) {
    return new CatalogSyncSkuDetailsRequestError(sku, error.message);
  }

  return new CatalogSyncSkuDetailsRequestError(sku, 'unknown error');
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
    throw new CatalogSyncSkuDetailsInvalidResponseError(
      `${field} must be a string, number, null or undefined`,
    );
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  field: string,
): number | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  throw new CatalogSyncSkuDetailsInvalidResponseError(
    `${field} must be a finite number, numeric string, null or undefined`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
