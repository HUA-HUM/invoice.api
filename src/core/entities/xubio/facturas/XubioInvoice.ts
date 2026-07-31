export type InvoiceType = 'Factura' | 'NotaCredito';
export type XubioInvoiceLetter = 'A' | 'B';

export interface XubioInvoice {
  type: InvoiceType;
  letter?: XubioInvoiceLetter;
  customerId: number;
  issueDate: string;
  dueDate: string;
  pointOfSaleId: number;
  description?: string;
  items: XubioInvoiceItem[];
  payments?: XubioPayment[];
  perceptions?: XubioPerception[];
  relatedDocument?: XubioRelatedDocument;
  exchangeRate?: number;
}

export interface XubioInvoiceItem {
  productId: number;
  warehouseId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  priceWithVat: number;
  discountPercentage?: number;
}

export interface XubioPayment {
  accountType?: string | null;
  accountId?: number | null;
  currencyId?: number | null;
  exchangeRate?: number | null;
  amountMainCurrency: number;
  amountTransactionCurrency: number;
  description?: string | null;
}

export interface XubioPerception {
  itemId?: number | null;
  description?: string | null;
  amount?: number | null;
}

export interface XubioRelatedDocument {
  id: number;
}

export interface CreateXubioInvoiceCommand {
  invoice: XubioInvoice;
}

export interface XubioFacturarReferencePayload {
  ID: number;
}

export interface XubioFacturarProductItemPayload {
  producto: XubioFacturarReferencePayload;
  deposito: XubioFacturarReferencePayload;
  descripcion: string;
  cantidad: number;
  precio: number;
  precioconivaincluido: number;
  porcentajeDescuento: number;
}

export interface XubioFacturarPaymentPayload {
  cuentaTipo?: string | null;
  cuentaId?: number | null;
  moneda?: XubioFacturarReferencePayload;
  cotizacionMonTransaccion?: number | null;
  importeMonPrincipal: number;
  importeMonTransaccion: number;
  descripcion: string;
}

export interface XubioFacturarPerceptionPayload {
  itemId?: number | null;
  descripcion?: string | null;
  importe?: number | null;
}

export interface XubioFacturarPayload {
  circuitoContable: XubioFacturarReferencePayload;
  cliente: XubioFacturarReferencePayload;
  tipo: number;
  fecha: string;
  fechaVto: string;
  puntoVenta: XubioFacturarReferencePayload;
  condicionDePago: number;
  deposito: XubioFacturarReferencePayload;
  cotizacion: number;
  cotizacionListaDePrecio: number;
  descripcion: string;
  cbuinformada: boolean;
  facturaNoExportacion: boolean;
  transaccionProductoItems: XubioFacturarProductItemPayload[];
  transaccionPercepcionItems: XubioFacturarPerceptionPayload[];
  transaccionCobranzaItems: XubioFacturarPaymentPayload[];
  comprobanteAsociado?: number;
}

export interface XubioCreatedInvoice {
  rawPayload: unknown;
  externalId?: string | null;
  numeroDocumento?: string | null;
  descripcion?: string | null;
  fecha?: string | null;
  fechaVto?: string | null;
  importeGravado?: number | null;
  importeImpuestos?: number | null;
  importeTotal?: number | null;
  transaccionId?: number | null;
  comprobanteId?: number | null;
  circuitoContableId?: number | null;
  depositoId?: number | null;
  condicionDePago?: number | null;
  puntoVentaId?: number | null;
  clienteId?: number | null;
  tipo?: number | null;
  cae?: string | null;
  caeFechaVto?: [number, number, number] | null;
  tienePeriodoServicio?: boolean | null;
  cbuInformada?: boolean | null;
  facturaNoExportacion?: boolean | null;
  productItems?: XubioCreatedInvoiceProductItem[];
  perceptionItems?: unknown[];
  cobranzaItems?: unknown[];
}

export interface XubioCreatedInvoiceProductItem {
  rawPayload: unknown;
  descripcion?: string | null;
  cantidad?: number | null;
  precio?: number | null;
  productoId?: number | null;
  depositoId?: number | null;
  precioConIvaIncluido?: number | null;
  porcentajeDescuento?: number | null;
}

export interface CreateXubioInvoiceResponse {
  invoice: XubioCreatedInvoice;
  rawPayload: unknown;
  xubioPayload: XubioFacturarPayload;
}

export interface DeleteXubioInvoiceCommand {
  transaccionId: number;
}

export interface DeleteXubioInvoiceResponse {
  transaccionId: number;
  deleted: true;
  rawPayload: unknown;
}
