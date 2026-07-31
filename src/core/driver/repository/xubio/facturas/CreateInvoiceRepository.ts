import axios, { type AxiosInstance } from 'axios';
import type { ICreateXubioInvoiceRepository } from '../../../../adapters/repositories/xubio/facturas/ICreateXubioInvoiceRepository';
import type {
  CreateXubioInvoiceCommand,
  CreateXubioInvoiceResponse,
  InvoiceType,
  XubioCreatedInvoice,
  XubioCreatedInvoiceProductItem,
  XubioFacturarPayload,
  XubioFacturarPaymentPayload,
  XubioFacturarPerceptionPayload,
  XubioFacturarProductItemPayload,
  XubioInvoice,
  XubioInvoiceItem,
  XubioPayment,
  XubioPerception,
} from '../../../../entities/xubio/facturas/XubioInvoice';
import {
  executeXubioRequestWithRetry,
  type XubioRequestRetryOptions,
} from '../XubioRequestRetry';

const DEFAULT_BASE_URL = 'https://xubio.com';
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 20_000;
const FACTURAR_PATH = '/API/1.1/facturar';
const DEFAULT_ACCOUNTING_CIRCUIT_ID = -2;
const DEFAULT_PAYMENT_CONDITION = 1;
const DEFAULT_EXCHANGE_RATE = 1;

export interface CreateInvoiceRepositoryOptions {
  baseUrl?: string;
  authorizationToken?: string;
  accessTokenProvider?: () => Promise<string>;
  onAuthorizationFailure?: () => void | Promise<void>;
  timeoutInMilliseconds?: number;
  httpClient?: AxiosInstance;
  retryOptions?: XubioRequestRetryOptions;
}

export class XubioInvoiceRequestError extends Error {
  constructor(description: string, detail?: string) {
    super(
      `Xubio request failed while creating invoice ${description}${detail === undefined ? '' : `: ${detail}`}`,
    );
    this.name = XubioInvoiceRequestError.name;
  }
}

export class XubioInvoiceInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Xubio returned an invalid invoice response: ${detail}`);
    this.name = XubioInvoiceInvalidResponseError.name;
  }
}

export class CreateInvoiceRepository implements ICreateXubioInvoiceRepository {
  private readonly httpClient: AxiosInstance;
  private readonly authorizationToken?: string;
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly onAuthorizationFailure?: () => void | Promise<void>;
  private readonly retryOptions: XubioRequestRetryOptions;

  constructor(options: CreateInvoiceRepositoryOptions = {}) {
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
    command: CreateXubioInvoiceCommand,
  ): Promise<CreateXubioInvoiceResponse> {
    const xubioPayload = buildFacturarPayload(command.invoice);

    try {
      const response = await executeXubioRequestWithRetry(
        async () =>
          this.httpClient.post<unknown>(FACTURAR_PATH, xubioPayload, {
            headers: await this.buildAuthorizationHeaders(),
          }),
        {
          ...this.retryOptions,
          onAuthorizationFailure: this.onAuthorizationFailure,
        },
      );

      return {
        invoice: parseCreatedInvoice(response.data),
        rawPayload: response.data,
        xubioPayload,
      };
    } catch (error: unknown) {
      if (error instanceof XubioInvoiceInvalidResponseError) {
        throw error;
      }

      throw buildRequestError(xubioPayload.descripcion, error);
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

export function buildFacturarPayload(
  invoice: XubioInvoice,
): XubioFacturarPayload {
  validateInvoice(invoice);

  const exchangeRate = invoice.exchangeRate ?? DEFAULT_EXCHANGE_RATE;
  const firstWarehouseId = invoice.items[0].warehouseId;
  const payload: XubioFacturarPayload = {
    circuitoContable: {
      ID: DEFAULT_ACCOUNTING_CIRCUIT_ID,
    },
    cliente: {
      ID: invoice.customerId,
    },
    tipo: mapInvoiceTypeToXubioTipo(invoice.type),
    fecha: invoice.issueDate,
    fechaVto: invoice.dueDate,
    puntoVenta: {
      ID: invoice.pointOfSaleId,
    },
    condicionDePago: DEFAULT_PAYMENT_CONDITION,
    deposito: {
      ID: firstWarehouseId,
    },
    cotizacion: exchangeRate,
    cotizacionListaDePrecio: exchangeRate,
    descripcion: normalizeOptionalString(invoice.description) ?? '',
    cbuinformada: false,
    facturaNoExportacion: false,
    transaccionProductoItems: invoice.items.map(toProductItemPayload),
    transaccionPercepcionItems: (invoice.perceptions ?? []).map(
      toPerceptionPayload,
    ),
    transaccionCobranzaItems: (invoice.payments ?? []).map((payment) =>
      toPaymentPayload(payment, exchangeRate),
    ),
  };

  if (invoice.relatedDocument !== undefined) {
    payload.comprobanteAsociado = invoice.relatedDocument.id;
  }

  return payload;
}

function toProductItemPayload(
  item: XubioInvoiceItem,
): XubioFacturarProductItemPayload {
  return {
    producto: {
      ID: item.productId,
    },
    deposito: {
      ID: item.warehouseId,
    },
    descripcion: item.description,
    cantidad: item.quantity,
    precio: item.unitPrice,
    precioconivaincluido: item.priceWithVat,
    porcentajeDescuento: item.discountPercentage ?? 0,
  };
}

function toPaymentPayload(
  payment: XubioPayment,
  defaultExchangeRate: number,
): XubioFacturarPaymentPayload {
  const payload: XubioFacturarPaymentPayload = {
    cuentaTipo: payment.accountType,
    cuentaId: payment.accountId,
    cotizacionMonTransaccion: payment.exchangeRate ?? defaultExchangeRate,
    importeMonPrincipal: payment.amountMainCurrency,
    importeMonTransaccion: payment.amountTransactionCurrency,
    descripcion: normalizeOptionalString(payment.description) ?? '',
  };

  if (payment.currencyId !== undefined && payment.currencyId !== null) {
    payload.moneda = {
      ID: payment.currencyId,
    };
  }

  return payload;
}

function toPerceptionPayload(
  perception: XubioPerception,
): XubioFacturarPerceptionPayload {
  return {
    itemId: perception.itemId,
    descripcion: perception.description,
    importe: perception.amount,
  };
}

function parseCreatedInvoice(value: unknown): XubioCreatedInvoice {
  if (!isRecord(value)) {
    throw new XubioInvoiceInvalidResponseError('body must be an object');
  }

  return {
    rawPayload: value,
    externalId: readOptionalNullableString(value, 'externalId'),
    numeroDocumento: readOptionalNullableString(value, 'numeroDocumento'),
    descripcion: readOptionalNullableString(value, 'descripcion'),
    fecha: readOptionalNullableString(value, 'fecha'),
    fechaVto: readOptionalNullableString(value, 'fechaVto'),
    importeGravado: readOptionalNullableNumber(value, 'importeGravado'),
    importeImpuestos: readOptionalNullableNumber(value, 'importeImpuestos'),
    importeTotal: readOptionalNullableNumber(value, 'importetotal'),
    transaccionId:
      readOptionalNullableNumber(value, 'transaccionid') ??
      readOptionalNullableNumber(value, 'transaccionId'),
    comprobanteId: readOptionalNullableNumber(value, 'comprobante'),
    circuitoContableId: readOptionalReferenceId(value, 'circuitoContable'),
    depositoId: readOptionalReferenceId(value, 'deposito'),
    condicionDePago: readOptionalNullableNumber(value, 'condicionDePago'),
    puntoVentaId: readOptionalReferenceId(value, 'puntoVenta'),
    clienteId: readOptionalReferenceId(value, 'cliente'),
    tipo: readOptionalNullableNumber(value, 'tipo'),
    cae:
      readOptionalNullableString(value, 'cae') ??
      readOptionalNullableString(value, 'CAE'),
    caeFechaVto: readOptionalCaeExpirationDate(value.caefechaVto),
    tienePeriodoServicio: readOptionalNullableBoolean(
      value,
      'tienePeriodoServicio',
    ),
    cbuInformada: readOptionalNullableBoolean(value, 'cbuinformada'),
    facturaNoExportacion: readOptionalNullableBoolean(
      value,
      'facturaNoExportacion',
    ),
    productItems: readOptionalArray(
      value,
      'transaccionProductoItems',
      parseCreatedInvoiceProductItem,
    ),
    perceptionItems: readOptionalUnknownArray(
      value,
      'transaccionPercepcionItems',
    ),
    cobranzaItems: readOptionalUnknownArray(value, 'transaccionCobranzaItems'),
  };
}

function parseCreatedInvoiceProductItem(
  value: unknown,
  path: string,
): XubioCreatedInvoiceProductItem {
  if (!isRecord(value)) {
    throw new XubioInvoiceInvalidResponseError(`${path} must be an object`);
  }

  return {
    rawPayload: value,
    descripcion: readOptionalNullableString(value, 'descripcion'),
    cantidad: readOptionalNullableNumber(value, 'cantidad'),
    precio: readOptionalNullableNumber(value, 'precio'),
    productoId: readOptionalReferenceId(value, 'producto'),
    depositoId: readOptionalReferenceId(value, 'deposito'),
    precioConIvaIncluido: readOptionalNullableNumber(
      value,
      'precioconivaincluido',
    ),
    porcentajeDescuento: readOptionalNullableNumber(
      value,
      'porcentajeDescuento',
    ),
  };
}

function mapInvoiceTypeToXubioTipo(type: InvoiceType): number {
  if (type === 'Factura') {
    return 1;
  }

  if (type === 'NotaCredito') {
    return 3;
  }

  throw new RangeError(`Unsupported invoice type "${String(type)}"`);
}

function validateInvoice(invoice: XubioInvoice): void {
  validatePositiveInteger(invoice.customerId, 'customerId');
  validateIsoDate(invoice.issueDate, 'issueDate');
  validateIsoDate(invoice.dueDate, 'dueDate');
  validatePositiveInteger(invoice.pointOfSaleId, 'pointOfSaleId');
  validatePositiveNumber(
    invoice.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
    'exchangeRate',
  );

  if (invoice.items.length === 0) {
    throw new RangeError('items must contain at least one item');
  }

  invoice.items.forEach(validateItem);

  if (invoice.type === 'NotaCredito' && invoice.relatedDocument === undefined) {
    throw new RangeError(
      'relatedDocument is required for NotaCredito invoices',
    );
  }

  if (invoice.relatedDocument !== undefined) {
    validatePositiveInteger(invoice.relatedDocument.id, 'relatedDocument.id');
  }

  invoice.payments?.forEach(validatePayment);
  invoice.perceptions?.forEach(validatePerception);
}

function validateItem(item: XubioInvoiceItem, index: number): void {
  validatePositiveInteger(item.productId, `items[${index}].productId`);
  validateInteger(item.warehouseId, `items[${index}].warehouseId`);
  validateNonEmptyString(item.description, `items[${index}].description`);
  validatePositiveNumber(item.quantity, `items[${index}].quantity`);
  validateFiniteNumber(item.unitPrice, `items[${index}].unitPrice`);
  validateFiniteNumber(item.priceWithVat, `items[${index}].priceWithVat`);
  validateFiniteNumber(
    item.discountPercentage ?? 0,
    `items[${index}].discountPercentage`,
  );
}

function validatePayment(payment: XubioPayment, index: number): void {
  if (payment.accountId !== undefined && payment.accountId !== null) {
    validatePositiveInteger(payment.accountId, `payments[${index}].accountId`);
  }
  if (payment.currencyId !== undefined && payment.currencyId !== null) {
    validateInteger(payment.currencyId, `payments[${index}].currencyId`);
  }
  validateFiniteNumber(
    payment.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
    `payments[${index}].exchangeRate`,
  );
  validateFiniteNumber(
    payment.amountMainCurrency,
    `payments[${index}].amountMainCurrency`,
  );
  validateFiniteNumber(
    payment.amountTransactionCurrency,
    `payments[${index}].amountTransactionCurrency`,
  );
}

function validatePerception(perception: XubioPerception, index: number): void {
  if (perception.itemId !== undefined && perception.itemId !== null) {
    validatePositiveInteger(perception.itemId, `perceptions[${index}].itemId`);
  }
  if (perception.amount !== undefined && perception.amount !== null) {
    validateFiniteNumber(perception.amount, `perceptions[${index}].amount`);
  }
}

function buildRequestError(
  description: string,
  error: unknown,
): XubioInvoiceRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    const detail =
      status === undefined
        ? error.message
        : `HTTP ${status} - ${serializeResponseBody(body)}`;

    return new XubioInvoiceRequestError(description, detail);
  }

  if (error instanceof Error) {
    return new XubioInvoiceRequestError(description, error.message);
  }

  return new XubioInvoiceRequestError(description, 'unknown error');
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
    'Content-Type': 'application/json',
  };

  if (authorizationToken !== undefined && authorizationToken.trim() !== '') {
    headers.Authorization = `Bearer ${authorizationToken}`;
  }

  return headers;
}

function validateIsoDate(value: string, field: string): void {
  validateNonEmptyString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${field} must have YYYY-MM-DD format`);
  }
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

function validateInteger(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${field} must be an integer`);
  }
}

function validatePositiveNumber(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive number`);
  }
}

function validateFiniteNumber(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number`);
  }
}

function validateNonEmptyString(value: string, field: string): void {
  if (value.trim() === '') {
    throw new RangeError(`${field} cannot be empty`);
  }
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function readOptionalNullableString(
  source: Record<string, unknown>,
  field: string,
): string | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new XubioInvoiceInvalidResponseError(
      `${field} must be a string, null or undefined`,
    );
  }

  return value;
}

function readOptionalNullableNumber(
  source: Record<string, unknown>,
  field: string,
): number | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioInvoiceInvalidResponseError(
      `${field} must be a number, null or undefined`,
    );
  }

  return value;
}

function readOptionalNullableBoolean(
  source: Record<string, unknown>,
  field: string,
): boolean | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'boolean') {
    throw new XubioInvoiceInvalidResponseError(
      `${field} must be a boolean, null or undefined`,
    );
  }

  return value;
}

function readOptionalReferenceId(
  source: Record<string, unknown>,
  field: string,
): number | null {
  const value = source[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new XubioInvoiceInvalidResponseError(
      `${field} must be an object, null or undefined`,
    );
  }

  return (
    readOptionalNullableNumber(value, 'ID') ??
    readOptionalNullableNumber(value, 'id')
  );
}

function readOptionalArray<T>(
  source: Record<string, unknown>,
  field: string,
  parser: (item: unknown, path: string) => T,
): T[] {
  const value = source[field];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new XubioInvoiceInvalidResponseError(
      `${field} must be an array, null or undefined`,
    );
  }

  return value.map((item, index) => parser(item, `${field}[${index}]`));
}

function readOptionalUnknownArray(
  source: Record<string, unknown>,
  field: string,
): unknown[] {
  const value = source[field];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new XubioInvoiceInvalidResponseError(
      `${field} must be an array, null or undefined`,
    );
  }

  return value;
}

function readOptionalCaeExpirationDate(
  value: unknown,
): [number, number, number] | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value) || value.length !== 3) {
    throw new XubioInvoiceInvalidResponseError(
      'caefechaVto must be an array with [year, month, day]',
    );
  }

  const year: unknown = value[0];
  const month: unknown = value[1];
  const day: unknown = value[2];
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new XubioInvoiceInvalidResponseError(
      'caefechaVto must contain integers',
    );
  }

  return [Number(year), Number(month), Number(day)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
