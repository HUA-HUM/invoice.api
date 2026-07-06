export const TLQV_SHEET_NAME = 'TLQV' as const;

export interface TlqvItemData {
  TLQV: string;
  'Valor Declarado': string;
  Peso: string;
  PESOVOLUMENTICO: string;
  VALORXKG: string;
  DI: string;
  TE: string;
  IVA: string;
  'Total Impuestos': string;
  'Total Flete': string;
  'Fijo Liberacion': string;
  Seguro: string;
  Total: string;
  tc: string;
  tc2: string;
  'tc impuesto': string;
  Productoco: string;
  'Productoco.b': string;
  DIFACTURA: string;
  'DIFACTURA.B': string;
  TEFACTURA: string;
  'TEFACTURA.B': string;
  IVAFACTURA: string;
  'IVAFACTURA.B': string;
  LAFACTURA: string;
  'LAFACTURA.B': string;
  A13VENTA: string;
  FLETEINTERNACIONALA: string;
  FLETEINTERNACIONALB: string;
  'NRO CARGA': string;
}

export interface TlqvItem {
  rowNumber: number;
  data: TlqvItemData;
}

export interface GetOneTlqvItemsCommand {
  page: number;
  pageSize: number;
}

export interface GetOneTlqvItemsResponse {
  page: number;
  pageSize: number;
  sheetName: typeof TLQV_SHEET_NAME;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  rows: TlqvItem[];
}

export interface GetAllTlqvItemsCommand {
  pageSize?: number;
}

export interface GetAllTlqvItemsResponse {
  pageSize: number;
  sheetName: typeof TLQV_SHEET_NAME;
  totalRows: number;
  totalPages: number;
  rows: TlqvItem[];
}
