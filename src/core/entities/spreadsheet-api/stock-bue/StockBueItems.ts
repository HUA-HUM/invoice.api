export const STOCK_BUE_SHEET_SLUG = 'stock-bue' as const;
export const STOCK_BUE_DISPATCHED_INSTRUCTION = 'DESPACHADA' as const;

export interface StockBueItemData {
  TLQV?: string;
  'N venta'?: string;
  Unidades?: string;
  Descripción?: string;
  'Fecha recepcion'?: string;
  'Fecha Salida'?: string;
  'Fecha Limite'?: string;
  Instruccion?: string;
  'fecha Instruccion'?: string;
  'NUEVA FECHA DE ML'?: string;
  OBSERVACIONES?: string;
  TRAFO?: string;
  'Tipo de Envío'?: string;
  'Estado ML'?: string;
  'TLQ x llegar'?: string;
  Producto?: string;
  'Nro Guia'?: string;
  [field: string]: string | undefined;
}

export interface StockBueItem {
  rowNumber: number;
  data: StockBueItemData;
}

export interface GetOneStockBueItemsCommand {
  page: number;
  pageSize: number;
}

export interface GetOneStockBueItemsResponse {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  rows: StockBueItem[];
}

export interface GetAllStockBueItemsCommand {
  pageSize?: number;
}

export interface GetAllStockBueItemsResponse {
  pageSize: number;
  totalRows: number;
  totalPages: number;
  rows: StockBueItem[];
}
