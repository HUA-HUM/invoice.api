export const COSTOS_OPERACIONES_SHEET_SLUG = 'costos-operaciones' as const;

export interface CostosOperacionesItemData {
  OPERACIÓN?: string;
  Producto?: string;
  'Fecha Venta'?: string;
  PESO?: string;
  'TC AMCO'?: string;
  'TC TLQ'?: string;
  'Precio de venta - Costo Cuotas'?: string;
  'Precio de venta'?: string;
  'Costo cuotas'?: string;
  'Aporte ML'?: string;
  'COMISION MP'?: string;
  'Incidencia comision'?: string;
  'ENVIO ML'?: string;
  'Precio AMZ'?: string;
  'Incidencia precio AMZ'?: string;
  'Deposito Usa'?: string;
  'IMPUESTOS MELI'?: string;
  'Impuestos sobre Precio de Venta'?: string;
  'Costos amco'?: string;
  'Ingerencia costos amco'?: string;
  'Impuestos AMCO'?: string;
  Costos?: string;
  'Ganancia Operativa'?: string;
  'Margen parcial'?: string;
  ID?: string;
  coment?: string;
  'ESTADO DEL DATO'?: string;
  SKU?: string;
  'COSTO AMCO ASS'?: string;
  'IMPUESTOS ASS'?: string;
  'Nro de Venta'?: string;
  'CANAL DE VENTA'?: string;
  ESTADO?: string;
  'PRECIO DE VENTA - CUOTAS DE TODAS'?: string;
  'promo?'?: string;
  CUIT?: string;
  [field: string]: string | undefined;
}

export interface CostosOperacionesItem {
  rowNumber: number;
  data: CostosOperacionesItemData;
}

export interface GetCostosOperacionesByTlqvCodeCommand {
  tlqvCode: string;
}

export type GetCostosOperacionesByTlqvCodeResponse =
  | {
      found: true;
      tlqvCode: string;
      item: CostosOperacionesItem;
    }
  | {
      found: false;
      tlqvCode: string;
      reason: 'not_found';
      rawPayload?: unknown;
    };
