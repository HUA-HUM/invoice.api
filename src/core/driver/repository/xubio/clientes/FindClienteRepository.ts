import axios, { type AxiosInstance } from 'axios';
import type { IFindXubioClienteRepository } from '../../../../adapters/repositories/xubio/clientes/IFindXubioClienteRepository';
import type {
  FindXubioClienteByNameCommand,
  FindXubioClienteResponse,
  XubioCliente,
  XubioClienteReference,
} from '../../../../entities/xubio/clientes/XubioCliente';
import {
  executeXubioRequestWithRetry,
  type XubioRequestRetryOptions,
} from '../XubioRequestRetry';

const DEFAULT_BASE_URL = 'https://xubio.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const CLIENTE_PATH = '/API/1.1/clienteBean';
const MAX_ERROR_BODY_LENGTH = 500;

export interface FindClienteRepositoryOptions {
  baseUrl?: string;
  authorizationToken?: string;
  accessTokenProvider?: () => Promise<string>;
  onAuthorizationFailure?: () => void | Promise<void>;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
  retryOptions?: XubioRequestRetryOptions;
}

export class XubioFindClienteRequestError extends Error {
  constructor(nombre: string, detail?: string) {
    super(
      `Xubio request failed while finding cliente by nombre "${nombre}"${detail === undefined ? '' : `: ${detail}`}`,
    );
    this.name = XubioFindClienteRequestError.name;
  }
}

export class XubioFindClienteInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Xubio returned an invalid cliente search response: ${detail}`);
    this.name = XubioFindClienteInvalidResponseError.name;
  }
}

export class FindClienteRepository implements IFindXubioClienteRepository {
  private readonly httpClient: AxiosInstance;
  private readonly authorizationToken?: string;
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly onAuthorizationFailure?: () => void | Promise<void>;
  private readonly retryOptions: XubioRequestRetryOptions;

  constructor(options: FindClienteRepositoryOptions = {}) {
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

  async findByName(
    command: FindXubioClienteByNameCommand,
  ): Promise<FindXubioClienteResponse> {
    const nombre = normalizeRequiredName(command.nombre);

    try {
      const response = await executeXubioRequestWithRetry(
        async () =>
          this.httpClient.get<unknown>(CLIENTE_PATH, {
            params: {
              nombre,
            },
            headers: await this.buildAuthorizationHeaders(),
          }),
        {
          ...this.retryOptions,
          onAuthorizationFailure: this.onAuthorizationFailure,
        },
      );

      return {
        clientes: parseClienteSearchResponse(response.data),
        rawPayload: response.data,
      };
    } catch (error: unknown) {
      if (error instanceof XubioFindClienteInvalidResponseError) {
        throw error;
      }

      throw buildRequestError(nombre, error);
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

function parseClienteSearchResponse(value: unknown): XubioCliente[] {
  if (!Array.isArray(value)) {
    throw new XubioFindClienteInvalidResponseError('body must be an array');
  }

  return value.map(parseClienteResponse);
}

function parseClienteResponse(value: unknown, index: number): XubioCliente {
  if (!isRecord(value)) {
    throw new XubioFindClienteInvalidResponseError(
      `body[${index}] must be an object`,
    );
  }

  return {
    clienteId: readNumber(value, 'cliente_id', index),
    nombre: readString(value, 'nombre', index),
    razonSocial: readOptionalString(value, 'razonSocial', index),
    primerNombre: readOptionalString(value, 'primerNombre', index),
    primerApellido: readOptionalString(value, 'primerApellido', index),
    identificacionTributaria: readOptionalReference(
      value,
      'identificacionTributaria',
      index,
    ),
    categoriaFiscal: readOptionalReference(value, 'categoriaFiscal', index),
    provincia: readOptionalReference(value, 'provincia', index),
    direccion: readOptionalString(value, 'direccion', index),
    codigoPostal: readOptionalString(value, 'codigoPostal', index),
    pais: readOptionalReference(value, 'pais', index),
    usrCode: readOptionalString(value, 'usrCode', index),
    descripcion: readOptionalString(value, 'descripcion', index),
    esClienteExtranjero: readOptionalNumber(
      value,
      'esclienteextranjero',
      index,
    ),
    esProveedor: readOptionalNumber(value, 'esProveedor', index),
    cuit:
      readOptionalString(value, 'cuit', index) ??
      readOptionalString(value, 'CUIT', index),
    dni:
      readOptionalString(value, 'dni', index) ??
      readOptionalString(value, 'DNI', index),
    rawPayload: value,
  };
}

function buildRequestError(
  nombre: string,
  error: unknown,
): XubioFindClienteRequestError {
  if (axios.isAxiosError(error)) {
    return new XubioFindClienteRequestError(nombre, getErrorDetail(error));
  }

  if (error instanceof Error) {
    return new XubioFindClienteRequestError(nombre, error.message);
  }

  return new XubioFindClienteRequestError(nombre, 'unknown error');
}

function getErrorDetail(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;

    return status === undefined
      ? error.message
      : `HTTP ${status} - ${serializeResponseBody(body)}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

function serializeResponseBody(value: unknown): string {
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

function normalizeRequiredName(value: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue === '') {
    throw new RangeError('nombre cannot be empty');
  }

  return normalizedValue;
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

function readNumber(
  source: Record<string, unknown>,
  field: string,
  index: number,
): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioFindClienteInvalidResponseError(
      `body[${index}].${field} must be a number`,
    );
  }

  return value;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  field: string,
  index: number,
): number | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioFindClienteInvalidResponseError(
      `body[${index}].${field} must be a number, null or undefined`,
    );
  }

  return value;
}

function readString(
  source: Record<string, unknown>,
  field: string,
  index: number,
): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new XubioFindClienteInvalidResponseError(
      `body[${index}].${field} must be a non-empty string`,
    );
  }

  return value;
}

function readOptionalString(
  source: Record<string, unknown>,
  field: string,
  index: number,
): string | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new XubioFindClienteInvalidResponseError(
      `body[${index}].${field} must be a string, null or undefined`,
    );
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function readOptionalReference(
  source: Record<string, unknown>,
  field: string,
  index: number,
): XubioClienteReference | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new XubioFindClienteInvalidResponseError(
      `body[${index}].${field} must be an object, null or undefined`,
    );
  }

  return {
    ID: readOptionalNumber(value, 'ID', index),
    id: readOptionalNumber(value, 'id', index),
    codigo: readOptionalString(value, 'codigo', index),
    nombre: readOptionalString(value, 'nombre', index),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
