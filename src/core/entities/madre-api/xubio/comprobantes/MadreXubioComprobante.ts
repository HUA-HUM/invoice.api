export type MadreXubioComprobanteDocumentKind =
  'INVOICE' | 'CREDIT_NOTE' | 'FCE' | 'UNKNOWN';

export type MadreXubioComprobanteSyncType =
  'historical_backfill' | 'daily_update' | 'manual_retry';

export type MadreXubioComprobanteSyncStatus =
  'running' | 'completed' | 'failed' | 'partial';

export type MadreXubioComprobanteWindowType = 'month' | 'day' | 'custom';

export interface MadreXubioProductItem {
  transaccionCvItemId?: number | null;
  productoId?: number | null;
  productoCodigo?: string | null;
  productoNombre?: string | null;
  depositoId?: number | null;
  depositoCodigo?: string | null;
  depositoNombre?: string | null;
  descripcion?: string | null;
  cantidad?: number | null;
  precio?: number | null;
  importe?: number | null;
  iva?: number | null;
  total?: number | null;
  precioConIvaIncluido?: number | null;
  montoExento?: number | null;
  porcentajeDescuento?: number | null;
  rawPayload: unknown;
}

export interface MadreXubioCobranzaItem {
  itemId?: number | null;
  cuentaTipo?: string | null;
  cuentaId?: number | null;
  monedaId?: number | null;
  monedaCodigo?: string | null;
  monedaNombre?: string | null;
  cotizacionMonedaTransaccion?: number | null;
  importeMonedaPrincipal?: number | null;
  importeMonedaTransaccion?: number | null;
  descripcion?: string | null;
  rawPayload: unknown;
}

export interface MadreXubioPercepcionItem {
  itemId?: number | null;
  descripcion?: string | null;
  importe?: number | null;
  rawPayload: unknown;
}

export interface MadreXubioComprobante {
  xubioTransactionId: number;
  syncRunId?: number | null;
  source?: string | null;
  externalId?: string | null;
  numeroDocumento?: string | null;
  tipoCodigo?: number | null;
  tipoNombre?: string | null;
  documentKind?: MadreXubioComprobanteDocumentKind | null;
  letraComprobante?: string | null;
  descripcion?: string | null;
  tlqvCode?: string | null;
  tlqvNumber?: number | null;
  mlOrderId?: string | null;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  importeGravado?: number | null;
  importeImpuestos?: number | null;
  importeTotal?: number | null;
  importeMonedaPrincipal?: number | null;
  monedaId?: number | null;
  monedaCodigo?: string | null;
  monedaNombre?: string | null;
  cotizacion?: number | null;
  cotizacionListaPrecio?: number | null;
  circuitoContableId?: number | null;
  circuitoContableCodigo?: string | null;
  circuitoContableNombre?: string | null;
  depositoId?: number | null;
  depositoCodigo?: string | null;
  depositoNombre?: string | null;
  condicionPago?: number | null;
  porcentajeComision?: number | null;
  puntoVentaId?: number | null;
  puntoVentaCodigo?: string | null;
  puntoVentaNombre?: string | null;
  clienteXubioId?: number | null;
  clienteCodigo?: string | null;
  clienteNombre?: string | null;
  provinciaId?: number | null;
  provinciaCodigo?: string | null;
  provinciaNombre?: string | null;
  facturaNoExportacion?: boolean | null;
  cbuInformada?: boolean | null;
  mailEstado?: string | null;
  cae?: string | null;
  caeFechaVencimiento?: string | null;
  fiscalmenteEmitido?: boolean | null;
  rawListPayload?: unknown;
  rawDetailPayload: unknown;
  syncedAt?: string | null;
  productItems?: MadreXubioProductItem[];
  cobranzaItems?: MadreXubioCobranzaItem[];
  percepcionItems?: MadreXubioPercepcionItem[];
}

export interface CreateMadreXubioComprobanteSyncRunCommand {
  syncType: MadreXubioComprobanteSyncType;
  status: 'running';
  fechaDesde: string;
  fechaHasta: string;
  windowType: MadreXubioComprobanteWindowType;
  metadata?: Record<string, unknown>;
}

export interface MadreXubioComprobanteSyncRun {
  id: number;
  syncType: MadreXubioComprobanteSyncType;
  status: MadreXubioComprobanteSyncStatus;
  fechaDesde: string;
  fechaHasta: string;
  windowType: MadreXubioComprobanteWindowType;
}

export interface UpdateMadreXubioComprobanteSyncRunCommand {
  id: number;
  status: MadreXubioComprobanteSyncStatus;
  totalListed: number;
  totalDetailRequests: number;
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
  hasSaturatedWindows: boolean;
  errorMessage?: string | null;
  finishedAt?: string;
}

export interface UpsertMadreXubioComprobantesBatchCommand {
  items: MadreXubioComprobante[];
}

export interface UpsertMadreXubioComprobantesBatchResponse {
  received?: number;
  inserted?: number;
  updated?: number;
  failed?: number;
}

export interface MadreXubioComprobanteTlqvLookupItem {
  xubioTransactionId?: number | null;
  externalId?: string | null;
  numeroDocumento?: string | null;
  documentKind?: MadreXubioComprobanteDocumentKind | null;
  tlqvCode: string;
  tlqvNumber?: number | null;
  fechaEmision?: string | null;
}

export interface FindMadreXubioComprobantesByTlqvCodesCommand {
  tlqvCodes: string[];
}

export interface FindMadreXubioComprobantesByTlqvCodesResponse {
  items: MadreXubioComprobanteTlqvLookupItem[];
}

export interface FindMadreXubioComprobanteByTlqvCodeCommand {
  tlqvCode: string;
}

export interface FindMadreXubioComprobanteByTlqvCodeResponse {
  items: MadreXubioComprobanteTlqvLookupItem[];
}

export interface FindFullMadreXubioComprobanteByTlqvCodeCommand {
  tlqvCode: string;
}

export interface FindFullMadreXubioComprobanteByTlqvCodeResponse {
  items: MadreXubioComprobante[];
}

export interface ExistsMadreXubioComprobanteByTlqvCodeCommand {
  tlqvCode: string;
}

export interface ExistsMadreXubioComprobanteByTlqvCodeResponse {
  tlqvCode: string;
  exists: boolean;
}
