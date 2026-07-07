import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetAllStockBueItemsRepository } from '../../adapters/repositories/spreadsheet-api/stock-bue/IGetAllStockBueItemsRepository';
import {
  STOCK_BUE_DISPATCHED_INSTRUCTION,
  type StockBueItem,
  type StockBueItemData,
} from '../../entities/spreadsheet-api/stock-bue/StockBueItems';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_COMPROBANTES_BATCH_SIZE = 500;

export interface FindUnbilledDispatchedStockBueTlqvCommand {
  pageSize?: number;
  comprobantesBatchSize?: number;
}

export interface UnbilledDispatchedStockBueTlqvItem {
  tlqvCode: string;
  rowNumber: number;
  saleNumber?: string;
  description?: string;
  instruction: typeof STOCK_BUE_DISPATCHED_INSTRUCTION;
  fechaRecepcion?: string;
  fechaSalida?: string;
  fechaLimite?: string;
  fechaInstruccion?: string;
  rawData: StockBueItemData;
}

export interface FindUnbilledDispatchedStockBueTlqvResponse {
  status: 'completed';
  instruction: typeof STOCK_BUE_DISPATCHED_INSTRUCTION;
  totalSheetRows: number;
  totalDispatchedRows: number;
  totalDispatchedRowsWithoutTlqv: number;
  totalUniqueDispatchedTlqv: number;
  totalBilledTlqv: number;
  totalUnbilledTlqv: number;
  items: UnbilledDispatchedStockBueTlqvItem[];
}

export class FindUnbilledDispatchedStockBueTlqvInteractor {
  constructor(
    private readonly getAllStockBueItemsRepository: IGetAllStockBueItemsRepository,
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
  ) {}

  async execute(
    command: FindUnbilledDispatchedStockBueTlqvCommand = {},
  ): Promise<FindUnbilledDispatchedStockBueTlqvResponse> {
    const pageSize = command.pageSize ?? DEFAULT_PAGE_SIZE;
    const comprobantesBatchSize =
      command.comprobantesBatchSize ?? DEFAULT_COMPROBANTES_BATCH_SIZE;
    validatePositiveInteger(pageSize, 'pageSize');
    validatePositiveInteger(comprobantesBatchSize, 'comprobantesBatchSize');

    const stockBue = await this.getAllStockBueItemsRepository.getAll({
      pageSize,
    });
    const dispatchedRows = stockBue.rows.filter(isDispatchedRow);
    const rowsByTlqvCode = groupFirstRowByTlqvCode(dispatchedRows);
    const tlqvCodes = [...rowsByTlqvCode.keys()];
    const billedTlqvCodes = await this.findBilledTlqvCodes(
      tlqvCodes,
      comprobantesBatchSize,
    );

    const items = tlqvCodes
      .filter((tlqvCode) => !billedTlqvCodes.has(tlqvCode))
      .map((tlqvCode) => toUnbilledItem(tlqvCode, rowsByTlqvCode));

    return {
      status: 'completed',
      instruction: STOCK_BUE_DISPATCHED_INSTRUCTION,
      totalSheetRows: stockBue.totalRows,
      totalDispatchedRows: dispatchedRows.length,
      totalDispatchedRowsWithoutTlqv:
        dispatchedRows.length - countRowsWithTlqv(dispatchedRows),
      totalUniqueDispatchedTlqv: tlqvCodes.length,
      totalBilledTlqv: billedTlqvCodes.size,
      totalUnbilledTlqv: items.length,
      items,
    };
  }

  private async findBilledTlqvCodes(
    tlqvCodes: string[],
    batchSize: number,
  ): Promise<Set<string>> {
    const billedCodes = new Set<string>();

    for (let index = 0; index < tlqvCodes.length; index += batchSize) {
      const batch = tlqvCodes.slice(index, index + batchSize);
      const response =
        await this.madreXubioComprobantesRepository.findByTlqvCodes({
          tlqvCodes: batch,
        });

      for (const item of response.items) {
        const tlqvCode = normalizeTlqvCode(item.tlqvCode);
        if (tlqvCode !== undefined) {
          billedCodes.add(tlqvCode);
        }
      }
    }

    return billedCodes;
  }
}

function isDispatchedRow(row: StockBueItem): boolean {
  return (
    normalizeInstruction(row.data.Instruccion) ===
    STOCK_BUE_DISPATCHED_INSTRUCTION
  );
}

function groupFirstRowByTlqvCode(
  rows: StockBueItem[],
): Map<string, StockBueItem> {
  const rowsByTlqvCode = new Map<string, StockBueItem>();

  for (const row of rows) {
    const tlqvCode = normalizeTlqvCode(row.data.TLQV);
    if (tlqvCode === undefined || rowsByTlqvCode.has(tlqvCode)) {
      continue;
    }
    rowsByTlqvCode.set(tlqvCode, row);
  }

  return rowsByTlqvCode;
}

function countRowsWithTlqv(rows: StockBueItem[]): number {
  return rows.filter((row) => normalizeTlqvCode(row.data.TLQV) !== undefined)
    .length;
}

function toUnbilledItem(
  tlqvCode: string,
  rowsByTlqvCode: Map<string, StockBueItem>,
): UnbilledDispatchedStockBueTlqvItem {
  const row = rowsByTlqvCode.get(tlqvCode);
  if (row === undefined) {
    throw new Error(`TLQV ${tlqvCode} was not found in stock-bue rows`);
  }

  return {
    tlqvCode,
    rowNumber: row.rowNumber,
    saleNumber: readOptionalText(row.data['N venta']),
    description: readOptionalText(row.data['Descripción']),
    instruction: STOCK_BUE_DISPATCHED_INSTRUCTION,
    fechaRecepcion: readOptionalText(row.data['Fecha recepcion']),
    fechaSalida: readOptionalText(row.data['Fecha Salida']),
    fechaLimite: readOptionalText(row.data['Fecha Limite']),
    fechaInstruccion: readOptionalText(row.data['fecha Instruccion']),
    rawData: row.data,
  };
}

function normalizeInstruction(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === '' ? undefined : normalized;
}

export function normalizeTlqvCode(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === undefined || normalized === '') {
    return undefined;
  }

  const match = normalized.match(/TLQV-\d+/);
  return match?.[0] ?? normalized;
}

function readOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === '' ? undefined : normalized;
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}
