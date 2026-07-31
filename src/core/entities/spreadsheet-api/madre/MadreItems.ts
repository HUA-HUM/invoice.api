export const MADRE_SHEET_NAME = 'MADRE' as const;

export type MadreSpreadsheetCellValue =
  string | string[] | number | boolean | null;

export interface MadreItemData {
  Identificador: string;
  'Nombre de Tarea'?: MadreSpreadsheetCellValue;
  FECHAAMAZON?: MadreSpreadsheetCellValue;
  FECHACOMPRA?: MadreSpreadsheetCellValue;
  FECHAENTREGA?: MadreSpreadsheetCellValue;
  FECHAVENTA?: MadreSpreadsheetCellValue;
  NROGUIA?: MadreSpreadsheetCellValue;
  NROVENTA?: MadreSpreadsheetCellValue;
  TRANSFORMADOR?: MadreSpreadsheetCellValue;
  NOMBREPRODUCTO?: MadreSpreadsheetCellValue;
  LINKML?: MadreSpreadsheetCellValue;
  ESTADO?: MadreSpreadsheetCellValue;
  ESTADOENVIO?: MadreSpreadsheetCellValue;
  ETD?: MadreSpreadsheetCellValue;
  OBSOPERACIONES?: MadreSpreadsheetCellValue;
  TIPOVENTA?: MadreSpreadsheetCellValue;
  LINKAMAZON?: MadreSpreadsheetCellValue;
  NPEDIDOAMZ?: MadreSpreadsheetCellValue;
  PESOPRODUCTO?: MadreSpreadsheetCellValue;
  'Tracking amazon'?: MadreSpreadsheetCellValue;
  'Cantidad de Unidades'?: MadreSpreadsheetCellValue;
  'CANTIDAD DE BULTOS'?: MadreSpreadsheetCellValue;
  PRECIOVENTA?: MadreSpreadsheetCellValue;
  SALDOML?: MadreSpreadsheetCellValue;
  COMISIONML?: MadreSpreadsheetCellValue;
  COSTOENVIO?: MadreSpreadsheetCellValue;
  [field: string]: MadreSpreadsheetCellValue | undefined;
}

export interface MadreItem {
  rowNumber: number;
  data: MadreItemData;
}

export interface GetMadreItemByTlqvCodeCommand {
  tlqvCode: string;
}

export type GetMadreItemByTlqvCodeResponse =
  | {
      found: true;
      tlqvCode: string;
      item: MadreItem;
    }
  | {
      found: false;
      tlqvCode: string;
      reason: 'not_found';
      rawPayload?: unknown;
    };
