export type XubioIsoDate = string;

export interface XubioReference {
  ID: number;
  id: number;
  nombre: string;
  codigo: string;
}

export type XubioCaeExpirationDate = [number, number, number];

export interface XubioComprobanteSummary {
  rawPayload: unknown;
  externalId: string | null;
  numeroDocumento: string | null;
  descripcion: string;
  fecha: XubioIsoDate;
  fechaVto: XubioIsoDate | null;
  importeGravado: number;
  importeImpuestos: number;
  importetotal: number;
  importeMonPrincipal: number | null;
  moneda: XubioReference;
  circuitoContable: XubioReference;
  cotizacion: number;
  deposito: XubioReference;
  condicionDePago: number;
  transaccionid: number;
  porcentajeComision: number | null;
  puntoVenta: XubioReference;
  facturaNoExportacion: boolean;
  cliente: XubioReference;
  tipo: number;
  mailEstado: string | null;
  cbuinformada: boolean | null;
  cae: string | null;
  caefechaVto: XubioCaeExpirationDate | null;
  CAE: string | null;
  provincia: XubioReference | null;
}

export interface XubioComprobanteProductItem {
  rawPayload: unknown;
  transaccionCVItemId: number;
  importe: number;
  descripcion: string;
  cantidad: number;
  precio: number;
  producto: XubioReference;
  deposito: XubioReference;
  iva: number;
  total: number;
  precioconivaincluido: number;
  montoExento: number;
  porcentajeDescuento: number;
  transaccionId: number;
}

export interface XubioComprobanteCobranzaItem {
  rawPayload: unknown;
  transaccionid: number;
  itemId: number;
  cuentaTipo: string;
  cuentaId: number | null;
  moneda: XubioReference;
  cotizacionMonTransaccion: number;
  importeMonPrincipal: number;
  importeMonTransaccion: number;
  descripcion: string;
}

export interface XubioComprobantePercepcionItem {
  rawPayload: unknown;
  itemId: number | null;
  descripcion: string | null;
  importe: number | null;
}

export interface XubioComprobanteDetail extends XubioComprobanteSummary {
  rawPayload: unknown;
  cotizacionListaDePrecio: number | null;
  transaccionProductoItems: XubioComprobanteProductItem[];
  transaccionCobranzaItems: XubioComprobanteCobranzaItem[];
  transaccionPercepcionItems: XubioComprobantePercepcionItem[];
}

export interface GetXubioComprobantesByDateCommand {
  fechaDesde: XubioIsoDate;
  fechaHasta: XubioIsoDate;
  limit?: number;
}

export interface GetXubioComprobantesByDateResponse {
  comprobantes: XubioComprobanteSummary[];
}

export interface GetXubioComprobanteDetailCommand {
  transaccionId: number;
}

export interface GetXubioComprobanteDetailResponse {
  comprobante: XubioComprobanteDetail;
}
