import axios, { type AxiosInstance } from 'axios';
import type { IGetFlokzuProcessInstanceRepository } from '../../../../adapters/repositories/flokzu/process-instance/IGetFlokzuProcessInstanceRepository';
import type {
  FlokzuProcessInstance,
  GetFlokzuProcessInstanceCommand,
  GetFlokzuProcessInstanceResponse,
} from '../../../../entities/flokzu/process-instance/FlokzuProcessInstance';

const DEFAULT_BASE_URL = 'https://app.flokzu.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const PROCESS_INSTANCE_PATH = '/flokzuopenapi/api/v2/process/instance';
const CUIT_COMPRADOR_FIELD = 'CUITCOMPRADOR';
const CUIT_ENVIO_FIELD = 'CUITENVIO';
const NOMBRE_DESTINATARIO_FIELD = 'NOMBREDESTINATARIO';
const TELEFONO_FIELD = 'TELEFONO';
const DIRECCION_FIELD = 'Datos Cliente';
const CIUDAD_FIELD = 'CIUDAD';
const PROVINCIA_FIELD = 'PROVINCIA';
const CODIGO_POSTAL_FIELD = 'CODIGO POSTAL';
const EMAIL_FIELD = 'EMAIL';

export interface GetFlokzuProcessInstanceRepositoryOptions {
  baseUrl?: string;
  apiKey?: string;
  username?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class FlokzuProcessInstanceRequestError extends Error {
  constructor(identifier: string, detail: string) {
    super(
      `Flokzu request failed while getting process instance ${identifier}: ${detail}`,
    );
    this.name = FlokzuProcessInstanceRequestError.name;
  }
}

export class FlokzuProcessInstanceInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Flokzu returned an invalid process instance response: ${detail}`);
    this.name = FlokzuProcessInstanceInvalidResponseError.name;
  }
}

export class FlokzuProcessInstanceConfigurationError extends Error {
  constructor(field: string) {
    super(`${field} is required to call Flokzu`);
    this.name = FlokzuProcessInstanceConfigurationError.name;
  }
}

export class GetFlokzuProcessInstanceRepository implements IGetFlokzuProcessInstanceRepository {
  private readonly httpClient: AxiosInstance;
  private readonly apiKey?: string;
  private readonly username?: string;

  constructor(options: GetFlokzuProcessInstanceRepositoryOptions = {}) {
    this.apiKey = options.apiKey;
    this.username = options.username;
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
      });
  }

  async getByIdentifier(
    command: GetFlokzuProcessInstanceCommand,
  ): Promise<GetFlokzuProcessInstanceResponse> {
    const identifier = normalizeIdentifier(command.identifier);

    try {
      const response = await this.httpClient.request<unknown>({
        method: 'GET',
        url: PROCESS_INSTANCE_PATH,
        headers: this.buildHeaders(),
        data: {
          identifier,
        },
      });

      return {
        processInstance: parseProcessInstanceResponse(
          response.data,
          identifier,
        ),
      };
    } catch (error: unknown) {
      if (
        error instanceof FlokzuProcessInstanceInvalidResponseError ||
        error instanceof FlokzuProcessInstanceConfigurationError
      ) {
        throw error;
      }

      throw buildRequestError(identifier, error);
    }
  }

  private buildHeaders(): Record<string, string> {
    const apiKey = readRequiredCredential(this.apiKey, 'apiKey');
    const username = readRequiredCredential(this.username, 'username');

    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Username': username,
    };
  }
}

function parseProcessInstanceResponse(
  value: unknown,
  expectedIdentifier: string,
): FlokzuProcessInstance {
  if (!isRecord(value)) {
    throw new FlokzuProcessInstanceInvalidResponseError(
      'body must be an object',
    );
  }

  if (value.status !== 'OK') {
    throw new FlokzuProcessInstanceInvalidResponseError(
      `status must be OK, received ${String(value.status)}`,
    );
  }

  if (!isRecord(value.data)) {
    throw new FlokzuProcessInstanceInvalidResponseError(
      'data must be an object',
    );
  }

  const identifier = readRequiredString(value.data, 'identifier');
  if (identifier !== expectedIdentifier) {
    throw new FlokzuProcessInstanceInvalidResponseError(
      `expected identifier ${expectedIdentifier}, received ${identifier}`,
    );
  }

  if (!isRecord(value.data.fields)) {
    throw new FlokzuProcessInstanceInvalidResponseError(
      'data.fields must be an object',
    );
  }

  const cuitComprador = readNullableString(
    value.data.fields,
    CUIT_COMPRADOR_FIELD,
  );
  const cuitEnvio = readNullableString(value.data.fields, CUIT_ENVIO_FIELD);
  const nombreDestinatario = readNullableString(
    value.data.fields,
    NOMBRE_DESTINATARIO_FIELD,
  );
  const direccion = normalizeAddress(
    readNullableString(value.data.fields, DIRECCION_FIELD),
  );
  const telefono = readNullableString(value.data.fields, TELEFONO_FIELD);
  const ciudad = readNullableString(value.data.fields, CIUDAD_FIELD);
  const provincia = readNullableString(value.data.fields, PROVINCIA_FIELD);
  const codigoPostal = readNullableString(
    value.data.fields,
    CODIGO_POSTAL_FIELD,
  );
  const email = readNullableString(value.data.fields, EMAIL_FIELD);

  return {
    identifier,
    fields: value.data.fields,
    cuitComprador,
    cuitCompradorDigits: normalizeDigits(cuitComprador),
    buyerData: {
      cuitComprador,
      cuitCompradorDigits: normalizeDigits(cuitComprador),
      cuitEnvio,
      cuitEnvioDigits: normalizeDigits(cuitEnvio),
      nombreDestinatario,
      telefono,
      direccion,
      ciudad,
      provincia,
      codigoPostal,
      email,
    },
    rawPayload: value,
  };
}

function buildRequestError(
  identifier: string,
  error: unknown,
): FlokzuProcessInstanceRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new FlokzuProcessInstanceRequestError(identifier, detail);
  }

  if (error instanceof Error) {
    return new FlokzuProcessInstanceRequestError(identifier, error.message);
  }

  return new FlokzuProcessInstanceRequestError(identifier, 'unknown error');
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

function normalizeIdentifier(value: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue === '') {
    throw new RangeError('identifier is required');
  }

  return normalizedValue;
}

function readRequiredCredential(
  value: string | undefined,
  field: string,
): string {
  if (value === undefined || value.trim() === '') {
    throw new FlokzuProcessInstanceConfigurationError(field);
  }

  return value.trim();
}

function readRequiredString(
  source: Record<string, unknown>,
  field: string,
): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FlokzuProcessInstanceInvalidResponseError(
      `${field} must be a non-empty string`,
    );
  }

  return value.trim();
}

function readNullableString(
  source: Record<string, unknown>,
  field: string,
): string | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new FlokzuProcessInstanceInvalidResponseError(
      `${field} must be a string or null`,
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
