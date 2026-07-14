import axios, { type AxiosInstance } from 'axios';
import type { ICreateXubioClienteRepository } from '../../../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type {
  CreateXubioClienteCommand,
  CreateXubioClienteResponse,
  XubioCliente,
  XubioClientePayload,
  XubioClienteReference,
} from '../../../../entities/xubio/clientes/XubioCliente';
import {
  executeXubioRequestWithRetry,
  type XubioRequestRetryOptions,
} from '../XubioRequestRetry';

const DEFAULT_BASE_URL = 'https://xubio.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const CLIENTE_PATH = '/API/1.1/clienteBean';

export interface CreateClienteRepositoryOptions {
  baseUrl?: string;
  authorizationToken?: string;
  accessTokenProvider?: () => Promise<string>;
  onAuthorizationFailure?: () => void | Promise<void>;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
  retryOptions?: XubioRequestRetryOptions;
}

export class XubioClienteRequestError extends Error {
  constructor(usrCode: string, detail?: string) {
    super(
      `Xubio request failed while creating cliente ${usrCode}${detail === undefined ? '' : `: ${detail}`}`,
    );
    this.name = XubioClienteRequestError.name;
  }
}

export class XubioClienteInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Xubio returned an invalid cliente response: ${detail}`);
    this.name = XubioClienteInvalidResponseError.name;
  }
}

export class CreateClienteRepository implements ICreateXubioClienteRepository {
  private readonly httpClient: AxiosInstance;
  private readonly authorizationToken?: string;
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly onAuthorizationFailure?: () => void | Promise<void>;
  private readonly retryOptions: XubioRequestRetryOptions;

  constructor(options: CreateClienteRepositoryOptions = {}) {
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

  async create(
    command: CreateXubioClienteCommand,
  ): Promise<CreateXubioClienteResponse> {
    validateClientePayload(command.cliente);

    try {
      const response = await executeXubioRequestWithRetry(
        async () =>
          this.httpClient.post<unknown>(CLIENTE_PATH, command.cliente, {
            headers: await this.buildAuthorizationHeaders(),
          }),
        {
          ...this.retryOptions,
          onAuthorizationFailure: this.onAuthorizationFailure,
        },
      );

      return {
        status: 'created',
        created: true,
        cliente: parseClienteResponse(response.data),
        rawPayload: response.data,
      };
    } catch (error: unknown) {
      if (error instanceof XubioClienteInvalidResponseError) {
        throw error;
      }

      if (isAlreadyExistingClienteError(error)) {
        return {
          status: 'already_exists',
          created: false,
          alreadyExistsDetail: getErrorDetail(error),
          rawPayload: axios.isAxiosError(error) ? error.response?.data : error,
        };
      }

      throw buildRequestError(command.cliente.usrCode, error);
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

function parseClienteResponse(value: unknown): XubioCliente {
  if (!isRecord(value)) {
    throw new XubioClienteInvalidResponseError('body must be an object');
  }

  return {
    clienteId: readNumber(value, 'cliente_id'),
    nombre: readString(value, 'nombre'),
    razonSocial: readOptionalString(value, 'razonSocial'),
    primerNombre: readOptionalString(value, 'primerNombre'),
    primerApellido: readOptionalString(value, 'primerApellido'),
    identificacionTributaria: readOptionalReference(
      value,
      'identificacionTributaria',
    ),
    categoriaFiscal: readOptionalReference(value, 'categoriaFiscal'),
    provincia: readOptionalReference(value, 'provincia'),
    direccion: readOptionalString(value, 'direccion'),
    codigoPostal: readOptionalString(value, 'codigoPostal'),
    pais: readOptionalReference(value, 'pais'),
    usrCode: readOptionalString(value, 'usrCode'),
    descripcion: readOptionalString(value, 'descripcion'),
    esClienteExtranjero: readOptionalNumber(value, 'esclienteextranjero'),
    esProveedor: readOptionalNumber(value, 'esProveedor'),
    cuit:
      readOptionalString(value, 'cuit') ?? readOptionalString(value, 'CUIT'),
    dni: readOptionalString(value, 'dni') ?? readOptionalString(value, 'DNI'),
    rawPayload: value,
  };
}

function buildRequestError(
  usrCode: string,
  error: unknown,
): XubioClienteRequestError {
  if (axios.isAxiosError(error)) {
    return new XubioClienteRequestError(usrCode, getErrorDetail(error));
  }

  if (error instanceof Error) {
    return new XubioClienteRequestError(usrCode, error.message);
  }

  return new XubioClienteRequestError(usrCode, 'unknown error');
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

function isAlreadyExistingClienteError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const bodyText = serializeResponseBody(error.response?.data).toLowerCase();
  return (
    bodyText.includes('número de identificación ya ha sido cargado') ||
    bodyText.includes('numero de identificacion ya ha sido cargado') ||
    bodyText.includes('ya existe el código') ||
    bodyText.includes('ya existe el codigo') ||
    bodyText.includes('ya existe el nombre') ||
    bodyText.includes('ha sido creado anteriormente')
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

function validateClientePayload(value: XubioClientePayload): void {
  validateNonEmptyString(value.nombre, 'nombre');
  validateNonEmptyString(value.razonSocial, 'razonSocial');
  validateNonEmptyString(
    value.identificacionTributaria.codigo,
    'identificacionTributaria.codigo',
  );
  validateNonEmptyString(
    value.categoriaFiscal.codigo,
    'categoriaFiscal.codigo',
  );
  validateNonEmptyString(value.pais.codigo, 'pais.codigo');
  validateNonEmptyString(value.cuit, 'cuit');
  validateNonEmptyString(value.CUIT, 'CUIT');
  validateNonEmptyString(value.usrCode, 'usrCode');
  validateNonEmptyString(value.descripcion, 'descripcion');
}

function validateNonEmptyString(value: string, field: string): void {
  if (value.trim() === '') {
    throw new RangeError(`${field} cannot be empty`);
  }
}

function buildHeaders(
  authorizationToken: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (authorizationToken !== undefined && authorizationToken.trim() !== '') {
    headers.Authorization = `Bearer ${authorizationToken}`;
  }

  return headers;
}

function readNumber(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioClienteInvalidResponseError(`${field} must be a number`);
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
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioClienteInvalidResponseError(
      `${field} must be a number, null or undefined`,
    );
  }

  return value;
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new XubioClienteInvalidResponseError(
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
  if (typeof value !== 'string') {
    throw new XubioClienteInvalidResponseError(
      `${field} must be a string, null or undefined`,
    );
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function readOptionalReference(
  source: Record<string, unknown>,
  field: string,
): XubioClienteReference | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new XubioClienteInvalidResponseError(
      `${field} must be an object, null or undefined`,
    );
  }

  return {
    ID: readOptionalNumber(value, 'ID'),
    id: readOptionalNumber(value, 'id'),
    codigo: readOptionalString(value, 'codigo'),
    nombre: readOptionalString(value, 'nombre'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
