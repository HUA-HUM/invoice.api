import axios, { type AxiosInstance } from 'axios';
import type { IMadreXubioComprobantesRepository } from '../../../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type {
  CreateMadreXubioComprobanteSyncRunCommand,
  ExistsMadreXubioComprobanteByTlqvCodeCommand,
  ExistsMadreXubioComprobanteByTlqvCodeResponse,
  FindMadreXubioComprobanteByTlqvCodeCommand,
  FindMadreXubioComprobanteByTlqvCodeResponse,
  FindMadreXubioComprobantesByTlqvCodesCommand,
  FindMadreXubioComprobantesByTlqvCodesResponse,
  FindFullMadreXubioComprobanteByTlqvCodeCommand,
  FindFullMadreXubioComprobanteByTlqvCodeResponse,
  MadreXubioCobranzaItem,
  MadreXubioComprobante,
  MadreXubioComprobanteDocumentKind,
  MadreXubioComprobanteSyncRun,
  MadreXubioComprobanteTlqvLookupItem,
  MadreXubioPercepcionItem,
  MadreXubioProductItem,
  UpdateMadreXubioComprobanteSyncRunCommand,
  UpsertMadreXubioComprobantesBatchCommand,
  UpsertMadreXubioComprobantesBatchResponse,
} from '../../../../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';

const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const BASE_PATH = '/api/internal/xubio/comprobantes';

export interface MadreXubioComprobantesRepositoryOptions {
  baseUrl?: string;
  internalApiKey?: string;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
}

export class MadreXubioComprobantesRequestError extends Error {
  constructor(operation: string, detail: string) {
    super(`Madre API request failed while trying to ${operation}: ${detail}`);
    this.name = MadreXubioComprobantesRequestError.name;
  }
}

export class MadreXubioComprobantesInvalidResponseError extends Error {
  constructor(detail: string) {
    super(
      `Madre API returned an invalid Xubio comprobantes response: ${detail}`,
    );
    this.name = MadreXubioComprobantesInvalidResponseError.name;
  }
}

export class MadreXubioComprobantesRepository implements IMadreXubioComprobantesRepository {
  private readonly httpClient: AxiosInstance;
  private readonly internalApiKey?: string;

  constructor(options: MadreXubioComprobantesRepositoryOptions = {}) {
    this.internalApiKey = options.internalApiKey;
    this.httpClient =
      options.httpClient ??
      axios.create({
        baseURL: readRequiredBaseUrl(options.baseUrl),
        timeout:
          options.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
        headers: buildBaseHeaders(),
      });
  }

  async createSyncRun(
    command: CreateMadreXubioComprobanteSyncRunCommand,
  ): Promise<MadreXubioComprobanteSyncRun> {
    try {
      const response = await this.httpClient.post<unknown>(
        `${BASE_PATH}/sync-runs`,
        command,
        {
          headers: this.buildHeaders(),
        },
      );
      return parseSyncRun(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('create sync run', error);
    }
  }

  async updateSyncRun(
    command: UpdateMadreXubioComprobanteSyncRunCommand,
  ): Promise<MadreXubioComprobanteSyncRun> {
    try {
      const { id, ...payload } = command;
      const response = await this.httpClient.patch<unknown>(
        `${BASE_PATH}/sync-runs/${encodeURIComponent(id)}`,
        payload,
        {
          headers: this.buildHeaders(),
        },
      );
      return parseSyncRun(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('update sync run', error);
    }
  }

  async upsertBatch(
    command: UpsertMadreXubioComprobantesBatchCommand,
  ): Promise<UpsertMadreXubioComprobantesBatchResponse> {
    if (command.items.length < 1) {
      throw new RangeError('items cannot be empty');
    }

    try {
      const response = await this.httpClient.post<unknown>(
        `${BASE_PATH}/upsert/batch`,
        command,
        {
          headers: this.buildHeaders(),
        },
      );

      if (response.data === undefined || response.data === null) {
        return {};
      }
      if (!isRecord(response.data)) {
        throw new MadreXubioComprobantesInvalidResponseError(
          'batch upsert response must be an object',
        );
      }

      return {
        received: readOptionalNumber(response.data, 'received'),
        inserted: readOptionalNumber(response.data, 'inserted'),
        updated: readOptionalNumber(response.data, 'updated'),
        failed: readOptionalNumber(response.data, 'failed'),
      };
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('upsert batch', error);
    }
  }

  async findByTlqvCodes(
    command: FindMadreXubioComprobantesByTlqvCodesCommand,
  ): Promise<FindMadreXubioComprobantesByTlqvCodesResponse> {
    if (command.tlqvCodes.length < 1) {
      return { items: [] };
    }

    try {
      const response = await this.httpClient.post<unknown>(
        `${BASE_PATH}/by-tlqv-codes`,
        command,
        {
          headers: this.buildHeaders(),
        },
      );

      return parseFindByTlqvCodesResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('find by TLQV codes', error);
    }
  }

  async findByTlqvCode(
    command: FindMadreXubioComprobanteByTlqvCodeCommand,
  ): Promise<FindMadreXubioComprobanteByTlqvCodeResponse> {
    const tlqvCode = command.tlqvCode.trim();
    if (tlqvCode === '') {
      return { items: [] };
    }

    try {
      const response = await this.httpClient.get<unknown>(
        `${BASE_PATH}/by-tlqv-code/${encodeURIComponent(tlqvCode)}`,
        {
          headers: this.buildHeaders(),
        },
      );

      return parseFindByTlqvCodesResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('find by TLQV code', error);
    }
  }

  async findFullByTlqvCode(
    command: FindFullMadreXubioComprobanteByTlqvCodeCommand,
  ): Promise<FindFullMadreXubioComprobanteByTlqvCodeResponse> {
    const tlqvCode = command.tlqvCode.trim();
    if (tlqvCode === '') {
      return { items: [] };
    }

    try {
      const response = await this.httpClient.get<unknown>(BASE_PATH, {
        headers: this.buildHeaders(),
        params: {
          tlqvCode,
          limit: 50,
        },
      });

      return parseFindFullByTlqvCodeResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('find full by TLQV code', error);
    }
  }

  async existsByTlqvCode(
    command: ExistsMadreXubioComprobanteByTlqvCodeCommand,
  ): Promise<ExistsMadreXubioComprobanteByTlqvCodeResponse> {
    const tlqvCode = command.tlqvCode.trim();
    if (tlqvCode === '') {
      return { tlqvCode, exists: false };
    }

    try {
      const response = await this.httpClient.get<unknown>(
        `${BASE_PATH}/exists-by-tlqv-code/${encodeURIComponent(tlqvCode)}`,
        {
          headers: this.buildHeaders(),
        },
      );

      return parseExistsByTlqvCodeResponse(response.data);
    } catch (error: unknown) {
      if (error instanceof MadreXubioComprobantesInvalidResponseError) {
        throw error;
      }
      throw buildRequestError('check if TLQV code exists', error);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers = buildBaseHeaders();

    if (
      this.internalApiKey !== undefined &&
      this.internalApiKey.trim() !== ''
    ) {
      headers['x-internal-api-key'] = this.internalApiKey.trim();
    }

    return headers;
  }
}

function buildRequestError(
  operation: string,
  error: unknown,
): MadreXubioComprobantesRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new MadreXubioComprobantesRequestError(operation, detail);
  }

  if (error instanceof Error) {
    return new MadreXubioComprobantesRequestError(operation, error.message);
  }

  return new MadreXubioComprobantesRequestError(operation, 'unknown error');
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

function buildBaseHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function readRequiredBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error('Madre API baseUrl is required');
  }

  return value.trim();
}

function parseSyncRun(value: unknown): MadreXubioComprobanteSyncRun {
  if (!isRecord(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      'sync run must be an object',
    );
  }

  return {
    id: readNumber(value, 'id'),
    syncType: readString(
      value,
      'syncType',
    ) as MadreXubioComprobanteSyncRun['syncType'],
    status: readString(
      value,
      'status',
    ) as MadreXubioComprobanteSyncRun['status'],
    fechaDesde: readString(value, 'fechaDesde'),
    fechaHasta: readString(value, 'fechaHasta'),
    windowType: readString(
      value,
      'windowType',
    ) as MadreXubioComprobanteSyncRun['windowType'],
  };
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a string`,
    );
  }
  return value;
}

function readNumber(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a number`,
    );
  }
  return value;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a number, null or undefined`,
    );
  }
  return value;
}

function parseFindByTlqvCodesResponse(
  value: unknown,
): FindMadreXubioComprobantesByTlqvCodesResponse {
  const rawItems = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : isRecord(value) && value.tlqvCode !== undefined
        ? [value]
        : undefined;

  if (rawItems === undefined) {
    throw new MadreXubioComprobantesInvalidResponseError(
      'TLQV lookup response must be an array or an object with items array',
    );
  }

  return {
    items: rawItems.map(parseTlqvLookupItem),
  };
}

function parseExistsByTlqvCodeResponse(
  value: unknown,
): ExistsMadreXubioComprobanteByTlqvCodeResponse {
  if (!isRecord(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      'exists response must be an object',
    );
  }

  return {
    tlqvCode: readString(value, 'tlqvCode'),
    exists: readBoolean(value, 'exists'),
  };
}

function parseFindFullByTlqvCodeResponse(
  value: unknown,
): FindFullMadreXubioComprobanteByTlqvCodeResponse {
  const rawItems = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : undefined;

  if (rawItems === undefined) {
    throw new MadreXubioComprobantesInvalidResponseError(
      'full TLQV lookup response must be an array or an object with items array',
    );
  }

  return {
    items: rawItems.map(parseFullComprobanteItem),
  };
}

function parseFullComprobanteItem(
  value: unknown,
  index: number,
): MadreXubioComprobante {
  if (!isRecord(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      `items[${index}] must be an object`,
    );
  }

  return {
    xubioTransactionId: readFlexibleNumber(value, 'xubioTransactionId'),
    syncRunId: readOptionalNullableFlexibleNumber(value, 'syncRunId'),
    source: readOptionalNullableString(value, 'source'),
    externalId: readOptionalNullableString(value, 'externalId'),
    numeroDocumento: readOptionalNullableString(value, 'numeroDocumento'),
    tipoCodigo: readOptionalNullableFlexibleNumber(value, 'tipoCodigo'),
    tipoNombre: readOptionalNullableString(value, 'tipoNombre'),
    documentKind: readOptionalNullableString(value, 'documentKind') as
      MadreXubioComprobanteDocumentKind | null | undefined,
    letraComprobante: readOptionalNullableString(value, 'letraComprobante'),
    descripcion: readOptionalNullableString(value, 'descripcion'),
    tlqvCode: readOptionalNullableString(value, 'tlqvCode'),
    tlqvNumber: readOptionalNullableFlexibleNumber(value, 'tlqvNumber'),
    mlOrderId: readOptionalNullableString(value, 'mlOrderId'),
    fechaEmision: readOptionalNullableString(value, 'fechaEmision') ?? '',
    fechaVencimiento: readOptionalNullableString(value, 'fechaVencimiento'),
    importeGravado: readOptionalNullableFlexibleNumber(value, 'importeGravado'),
    importeImpuestos: readOptionalNullableFlexibleNumber(
      value,
      'importeImpuestos',
    ),
    importeTotal: readOptionalNullableFlexibleNumber(value, 'importeTotal'),
    importeMonedaPrincipal: readOptionalNullableFlexibleNumber(
      value,
      'importeMonedaPrincipal',
    ),
    monedaId: readOptionalNullableFlexibleNumber(value, 'monedaId'),
    monedaCodigo: readOptionalNullableString(value, 'monedaCodigo'),
    monedaNombre: readOptionalNullableString(value, 'monedaNombre'),
    cotizacion: readOptionalNullableFlexibleNumber(value, 'cotizacion'),
    cotizacionListaPrecio: readOptionalNullableFlexibleNumber(
      value,
      'cotizacionListaPrecio',
    ),
    circuitoContableId: readOptionalNullableFlexibleNumber(
      value,
      'circuitoContableId',
    ),
    circuitoContableCodigo: readOptionalNullableString(
      value,
      'circuitoContableCodigo',
    ),
    circuitoContableNombre: readOptionalNullableString(
      value,
      'circuitoContableNombre',
    ),
    depositoId: readOptionalNullableFlexibleNumber(value, 'depositoId'),
    depositoCodigo: readOptionalNullableString(value, 'depositoCodigo'),
    depositoNombre: readOptionalNullableString(value, 'depositoNombre'),
    condicionPago: readOptionalNullableFlexibleNumber(value, 'condicionPago'),
    porcentajeComision: readOptionalNullableFlexibleNumber(
      value,
      'porcentajeComision',
    ),
    puntoVentaId: readOptionalNullableFlexibleNumber(value, 'puntoVentaId'),
    puntoVentaCodigo: readOptionalNullableString(value, 'puntoVentaCodigo'),
    puntoVentaNombre: readOptionalNullableString(value, 'puntoVentaNombre'),
    clienteXubioId: readOptionalNullableFlexibleNumber(value, 'clienteXubioId'),
    clienteCodigo: readOptionalNullableString(value, 'clienteCodigo'),
    clienteNombre: readOptionalNullableString(value, 'clienteNombre'),
    provinciaId: readOptionalNullableFlexibleNumber(value, 'provinciaId'),
    provinciaCodigo: readOptionalNullableString(value, 'provinciaCodigo'),
    provinciaNombre: readOptionalNullableString(value, 'provinciaNombre'),
    facturaNoExportacion: readOptionalNullableBoolean(
      value,
      'facturaNoExportacion',
    ),
    cbuInformada: readOptionalNullableBoolean(value, 'cbuInformada'),
    mailEstado: readOptionalNullableString(value, 'mailEstado'),
    cae: readOptionalNullableString(value, 'cae'),
    caeFechaVencimiento: readOptionalNullableString(
      value,
      'caeFechaVencimiento',
    ),
    fiscalmenteEmitido: readOptionalNullableBoolean(
      value,
      'fiscalmenteEmitido',
    ),
    rawListPayload: value.rawListPayload,
    rawDetailPayload: value.rawDetailPayload,
    syncedAt: readOptionalNullableString(value, 'syncedAt'),
    productItems: parseProductItems(value.productItems),
    cobranzaItems: parseCobranzaItems(value.cobranzaItems),
    percepcionItems: parsePercepcionItems(value.percepcionItems),
  };
}

function parseProductItems(value: unknown): MadreXubioProductItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new MadreXubioComprobantesInvalidResponseError(
        `productItems[${index}] must be an object`,
      );
    }

    return {
      transaccionCvItemId: readOptionalNullableFlexibleNumber(
        item,
        'transaccionCvItemId',
      ),
      productoId: readOptionalNullableFlexibleNumber(item, 'productoId'),
      productoCodigo: readOptionalNullableString(item, 'productoCodigo'),
      productoNombre: readOptionalNullableString(item, 'productoNombre'),
      depositoId: readOptionalNullableFlexibleNumber(item, 'depositoId'),
      depositoCodigo: readOptionalNullableString(item, 'depositoCodigo'),
      depositoNombre: readOptionalNullableString(item, 'depositoNombre'),
      descripcion: readOptionalNullableString(item, 'descripcion'),
      cantidad: readOptionalNullableFlexibleNumber(item, 'cantidad'),
      precio: readOptionalNullableFlexibleNumber(item, 'precio'),
      importe: readOptionalNullableFlexibleNumber(item, 'importe'),
      iva: readOptionalNullableFlexibleNumber(item, 'iva'),
      total: readOptionalNullableFlexibleNumber(item, 'total'),
      precioConIvaIncluido: readOptionalNullableFlexibleNumber(
        item,
        'precioConIvaIncluido',
      ),
      montoExento: readOptionalNullableFlexibleNumber(item, 'montoExento'),
      porcentajeDescuento: readOptionalNullableFlexibleNumber(
        item,
        'porcentajeDescuento',
      ),
      rawPayload: item.rawPayload,
    };
  });
}

function parseCobranzaItems(value: unknown): MadreXubioCobranzaItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new MadreXubioComprobantesInvalidResponseError(
        `cobranzaItems[${index}] must be an object`,
      );
    }

    return {
      itemId: readOptionalNullableFlexibleNumber(item, 'itemId'),
      cuentaTipo: readOptionalNullableString(item, 'cuentaTipo'),
      cuentaId: readOptionalNullableFlexibleNumber(item, 'cuentaId'),
      monedaId: readOptionalNullableFlexibleNumber(item, 'monedaId'),
      monedaCodigo: readOptionalNullableString(item, 'monedaCodigo'),
      monedaNombre: readOptionalNullableString(item, 'monedaNombre'),
      cotizacionMonedaTransaccion: readOptionalNullableFlexibleNumber(
        item,
        'cotizacionMonedaTransaccion',
      ),
      importeMonedaPrincipal: readOptionalNullableFlexibleNumber(
        item,
        'importeMonedaPrincipal',
      ),
      importeMonedaTransaccion: readOptionalNullableFlexibleNumber(
        item,
        'importeMonedaTransaccion',
      ),
      descripcion: readOptionalNullableString(item, 'descripcion'),
      rawPayload: item.rawPayload,
    };
  });
}

function parsePercepcionItems(value: unknown): MadreXubioPercepcionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new MadreXubioComprobantesInvalidResponseError(
        `percepcionItems[${index}] must be an object`,
      );
    }

    return {
      itemId: readOptionalNullableFlexibleNumber(item, 'itemId'),
      descripcion: readOptionalNullableString(item, 'descripcion'),
      importe: readOptionalNullableFlexibleNumber(item, 'importe'),
      rawPayload: item.rawPayload,
    };
  });
}

function parseTlqvLookupItem(
  value: unknown,
  index: number,
): MadreXubioComprobanteTlqvLookupItem {
  if (!isRecord(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      `items[${index}] must be an object`,
    );
  }

  return {
    xubioTransactionId: readOptionalNullableNumber(value, 'xubioTransactionId'),
    externalId: readOptionalNullableString(value, 'externalId'),
    numeroDocumento: readOptionalNullableString(value, 'numeroDocumento'),
    documentKind: readOptionalNullableString(value, 'documentKind') as
      MadreXubioComprobanteDocumentKind | null | undefined,
    tlqvCode: readString(value, 'tlqvCode'),
    tlqvNumber: readOptionalNullableNumber(value, 'tlqvNumber'),
    fechaEmision: readOptionalNullableString(value, 'fechaEmision'),
  };
}

function readOptionalNullableString(
  source: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'string') {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a string, null or undefined`,
    );
  }
  return value;
}

function readOptionalNullableNumber(
  source: Record<string, unknown>,
  field: string,
): number | null | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a number, null or undefined`,
    );
  }
  return value;
}

function readFlexibleNumber(
  source: Record<string, unknown>,
  field: string,
): number {
  const value = readOptionalNullableFlexibleNumber(source, field);
  if (value === undefined || value === null) {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a number`,
    );
  }
  return value;
}

function readOptionalNullableFlexibleNumber(
  source: Record<string, unknown>,
  field: string,
): number | null | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return value;
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
  throw new MadreXubioComprobantesInvalidResponseError(
    `${field} must be a number, numeric string, null or undefined`,
  );
}

function readOptionalNullableBoolean(
  source: Record<string, unknown>,
  field: string,
): boolean | null | undefined {
  const value = source[field];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'boolean') {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a boolean, null or undefined`,
    );
  }
  return value;
}

function readBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new MadreXubioComprobantesInvalidResponseError(
      `${field} must be a boolean`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
