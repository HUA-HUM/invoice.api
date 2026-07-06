import type {
  XubioCaeExpirationDate,
  XubioComprobanteCobranzaItem,
  XubioComprobanteDetail,
  XubioComprobantePercepcionItem,
  XubioComprobanteProductItem,
  XubioComprobanteSummary,
  XubioReference,
} from '../../../entities/xubio/comprobantes/XubioComprobante';

export class XubioComprobanteInvalidResponseError extends Error {
  constructor(detail: string) {
    super(`Xubio returned an invalid comprobante response: ${detail}`);
    this.name = XubioComprobanteInvalidResponseError.name;
  }
}

export function parseComprobanteSummary(
  value: unknown,
  path = 'comprobante',
): XubioComprobanteSummary {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an object`);
  }

  return {
    rawPayload: value,
    externalId: readOptionalNullableString(value, 'externalId'),
    numeroDocumento: readOptionalNullableString(value, 'numeroDocumento'),
    descripcion: readString(value, 'descripcion'),
    fecha: readString(value, 'fecha'),
    fechaVto: readOptionalNullableString(value, 'fechaVto'),
    importeGravado: readNumber(value, 'importeGravado'),
    importeImpuestos: readNumber(value, 'importeImpuestos'),
    importetotal: readNumber(value, 'importetotal'),
    importeMonPrincipal: readOptionalNullableNumber(
      value,
      'importeMonPrincipal',
    ),
    moneda: parseReference(value.moneda, `${path}.moneda`),
    circuitoContable: parseReference(
      value.circuitoContable,
      `${path}.circuitoContable`,
    ),
    cotizacion: readNumber(value, 'cotizacion'),
    deposito: parseReference(value.deposito, `${path}.deposito`),
    condicionDePago: readNumber(value, 'condicionDePago'),
    transaccionid: readPositiveInteger(value, 'transaccionid'),
    porcentajeComision: readOptionalNullableNumber(value, 'porcentajeComision'),
    puntoVenta: parseReference(value.puntoVenta, `${path}.puntoVenta`),
    facturaNoExportacion: readBoolean(value, 'facturaNoExportacion'),
    cliente: parseReference(value.cliente, `${path}.cliente`),
    tipo: readNumber(value, 'tipo'),
    mailEstado: readOptionalNullableString(value, 'mailEstado'),
    cbuinformada: readOptionalNullableBoolean(value, 'cbuinformada'),
    cae: readOptionalNullableString(value, 'cae'),
    caefechaVto: parseOptionalCaeExpirationDate(
      value.caefechaVto,
      `${path}.caefechaVto`,
    ),
    CAE: readOptionalNullableString(value, 'CAE'),
    provincia:
      value.provincia === undefined || value.provincia === null
        ? null
        : parseReference(value.provincia, `${path}.provincia`),
  };
}

export function parseComprobanteListItem(
  value: unknown,
  path = 'comprobante',
): XubioComprobanteSummary {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an object`);
  }

  return {
    rawPayload: value,
    externalId: readOptionalStringLenient(value, 'externalId'),
    numeroDocumento: readOptionalStringLenient(value, 'numeroDocumento'),
    descripcion: readOptionalStringLenient(value, 'descripcion') ?? '',
    fecha: readOptionalStringLenient(value, 'fecha') ?? '',
    fechaVto: readOptionalStringLenient(value, 'fechaVto'),
    importeGravado: readOptionalNumberLenient(value, 'importeGravado') ?? 0,
    importeImpuestos: readOptionalNumberLenient(value, 'importeImpuestos') ?? 0,
    importetotal: readOptionalNumberLenient(value, 'importetotal') ?? 0,
    importeMonPrincipal: readOptionalNumberLenient(
      value,
      'importeMonPrincipal',
    ),
    moneda: parseReferenceLenient(value.moneda),
    circuitoContable: parseReferenceLenient(value.circuitoContable),
    cotizacion: readOptionalNumberLenient(value, 'cotizacion') ?? 0,
    deposito: parseReferenceLenient(value.deposito),
    condicionDePago: readOptionalNumberLenient(value, 'condicionDePago') ?? 0,
    transaccionid: readPositiveIntegerFromAnyField(
      value,
      [
        'transaccionid',
        'transaccionId',
        'transactionId',
        'transactionID',
        'id',
        'ID',
      ],
      path,
    ),
    porcentajeComision: readOptionalNumberLenient(value, 'porcentajeComision'),
    puntoVenta: parseReferenceLenient(value.puntoVenta),
    facturaNoExportacion:
      readOptionalBooleanLenient(value, 'facturaNoExportacion') ?? false,
    cliente: parseReferenceLenient(value.cliente),
    tipo: readOptionalNumberLenient(value, 'tipo') ?? 0,
    mailEstado: readOptionalStringLenient(value, 'mailEstado'),
    cbuinformada: readOptionalBooleanLenient(value, 'cbuinformada'),
    cae: readOptionalStringLenient(value, 'cae'),
    caefechaVto: parseOptionalCaeExpirationDateLenient(value.caefechaVto),
    CAE: readOptionalStringLenient(value, 'CAE'),
    provincia: parseReferenceOrNullLenient(value.provincia),
  };
}

export function parseComprobanteDetail(value: unknown): XubioComprobanteDetail {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(
      'comprobante detail must be an object',
    );
  }

  return {
    ...parseComprobanteSummary(value, 'comprobanteDetail'),
    cotizacionListaDePrecio: readOptionalNullableNumber(
      value,
      'cotizacionListaDePrecio',
    ),
    transaccionProductoItems: parseArray(
      value.transaccionProductoItems,
      'transaccionProductoItems',
      parseProductItem,
    ),
    transaccionCobranzaItems: parseArray(
      value.transaccionCobranzaItems,
      'transaccionCobranzaItems',
      parseCobranzaItem,
    ),
    transaccionPercepcionItems: parseArray(
      value.transaccionPercepcionItems,
      'transaccionPercepcionItems',
      parsePercepcionItem,
    ),
  };
}

function parseProductItem(
  value: unknown,
  path: string,
): XubioComprobanteProductItem {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an object`);
  }

  return {
    rawPayload: value,
    transaccionCVItemId: readPositiveInteger(value, 'transaccionCVItemId'),
    importe: readNumber(value, 'importe'),
    descripcion: readString(value, 'descripcion'),
    cantidad: readNumber(value, 'cantidad'),
    precio: readNumber(value, 'precio'),
    producto: parseReference(value.producto, `${path}.producto`),
    deposito: parseReference(value.deposito, `${path}.deposito`),
    iva: readNumber(value, 'iva'),
    total: readNumber(value, 'total'),
    precioconivaincluido: readNumber(value, 'precioconivaincluido'),
    montoExento: readNumber(value, 'montoExento'),
    porcentajeDescuento: readNumber(value, 'porcentajeDescuento'),
    transaccionId: readPositiveInteger(value, 'transaccionId'),
  };
}

function parseCobranzaItem(
  value: unknown,
  path: string,
): XubioComprobanteCobranzaItem {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an object`);
  }

  return {
    rawPayload: value,
    transaccionid: readPositiveInteger(value, 'transaccionid'),
    itemId: readPositiveInteger(value, 'itemId'),
    cuentaTipo: readString(value, 'cuentaTipo'),
    cuentaId: readOptionalNullableNumber(value, 'cuentaId'),
    moneda: parseReference(value.moneda, `${path}.moneda`),
    cotizacionMonTransaccion: readNumber(value, 'cotizacionMonTransaccion'),
    importeMonPrincipal: readNumber(value, 'importeMonPrincipal'),
    importeMonTransaccion: readNumber(value, 'importeMonTransaccion'),
    descripcion: readString(value, 'descripcion'),
  };
}

function parsePercepcionItem(
  value: unknown,
  path: string,
): XubioComprobantePercepcionItem {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an object`);
  }

  return {
    rawPayload: value,
    itemId: readOptionalNullableNumber(value, 'itemId'),
    descripcion: readOptionalNullableString(value, 'descripcion'),
    importe: readOptionalNullableNumber(value, 'importe'),
  };
}

function parseReference(value: unknown, path: string): XubioReference {
  if (!isRecord(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an object`);
  }

  return {
    ID: readNumber(value, 'ID'),
    id: readNumber(value, 'id'),
    nombre: readString(value, 'nombre'),
    codigo: readString(value, 'codigo'),
  };
}

function parseReferenceLenient(value: unknown): XubioReference {
  if (!isRecord(value)) {
    return createEmptyReference();
  }

  return {
    ID: readOptionalNumberLenient(value, 'ID') ?? 0,
    id: readOptionalNumberLenient(value, 'id') ?? 0,
    nombre: readOptionalStringLenient(value, 'nombre') ?? '',
    codigo: readOptionalStringLenient(value, 'codigo') ?? '',
  };
}

function parseReferenceOrNullLenient(value: unknown): XubioReference | null {
  if (value === undefined || value === null) {
    return null;
  }

  return parseReferenceLenient(value);
}

function createEmptyReference(): XubioReference {
  return {
    ID: 0,
    id: 0,
    nombre: '',
    codigo: '',
  };
}

function parseOptionalCaeExpirationDate(
  value: unknown,
  path: string,
): XubioCaeExpirationDate | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 3) {
    throw new XubioComprobanteInvalidResponseError(
      `${path} must be an array with [year, month, day]`,
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
    throw new XubioComprobanteInvalidResponseError(
      `${path} must contain integers`,
    );
  }

  return [Number(year), Number(month), Number(day)];
}

function parseOptionalCaeExpirationDateLenient(
  value: unknown,
): XubioCaeExpirationDate | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }

  const year: unknown = value[0];
  const month: unknown = value[1];
  const day: unknown = value[2];
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return [Number(year), Number(month), Number(day)];
}

function parseArray<T>(
  value: unknown,
  path: string,
  parser: (item: unknown, path: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new XubioComprobanteInvalidResponseError(`${path} must be an array`);
  }

  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new XubioComprobanteInvalidResponseError(`${field} must be a string`);
  }
  return value;
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
    throw new XubioComprobanteInvalidResponseError(
      `${field} must be a string, null or undefined`,
    );
  }
  return value;
}

function readNumber(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new XubioComprobanteInvalidResponseError(`${field} must be a number`);
  }
  return value;
}

function readPositiveInteger(
  source: Record<string, unknown>,
  field: string,
): number {
  const value = readNumber(source, field);
  if (!Number.isInteger(value) || value < 1) {
    throw new XubioComprobanteInvalidResponseError(
      `${field} must be a positive integer`,
    );
  }
  return value;
}

function readPositiveIntegerFromAnyField(
  source: Record<string, unknown>,
  fields: string[],
  path: string,
): number {
  for (const field of fields) {
    const value = source[field];
    const parsedValue = parsePositiveIntegerValue(value);
    if (parsedValue !== null) {
      return parsedValue;
    }
  }

  throw new XubioComprobanteInvalidResponseError(
    `${path} must include a positive transaction id`,
  );
}

function parsePositiveIntegerValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsedValue = Number(value);
    return Number.isSafeInteger(parsedValue) && parsedValue > 0
      ? parsedValue
      : null;
  }

  return null;
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
    throw new XubioComprobanteInvalidResponseError(
      `${field} must be a number, null or undefined`,
    );
  }
  return value;
}

function readOptionalNumberLenient(
  source: Record<string, unknown>,
  field: string,
): number | null {
  const value = source[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalStringLenient(
  source: Record<string, unknown>,
  field: string,
): string | null {
  const value = source[field];
  return typeof value === 'string' ? value : null;
}

function readBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new XubioComprobanteInvalidResponseError(
      `${field} must be a boolean`,
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
    throw new XubioComprobanteInvalidResponseError(
      `${field} must be a boolean, null or undefined`,
    );
  }
  return value;
}

function readOptionalBooleanLenient(
  source: Record<string, unknown>,
  field: string,
): boolean | null {
  const value = source[field];
  return typeof value === 'boolean' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
