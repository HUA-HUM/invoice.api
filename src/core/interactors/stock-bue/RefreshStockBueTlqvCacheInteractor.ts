import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IGetAllStockBueItemsRepository } from '../../adapters/repositories/spreadsheet-api/stock-bue/IGetAllStockBueItemsRepository';
import type {
  StockBueTlqvCacheItem,
  StockBueTlqvCacheMetadata,
} from '../../entities/cache/stock-bue/StockBueTlqvCache';
import type { StockBueItem } from '../../entities/spreadsheet-api/stock-bue/StockBueItems';
import { normalizeTlqvCode } from './FindUnbilledDispatchedStockBueTlqvInteractor';

const DEFAULT_PAGE_SIZE = 100;

export interface RefreshStockBueTlqvCacheCommand {
  pageSize?: number;
}

export interface RefreshStockBueTlqvCacheResponse {
  status: 'completed';
  refreshedAt: string;
  totalSheetRows: number;
  totalRowsWithTlqv: number;
  totalRowsWithoutTlqv: number;
  totalUniqueTlqv: number;
  instructionCounts: Record<string, number>;
}

export class RefreshStockBueTlqvCacheInteractor {
  constructor(
    private readonly getAllStockBueItemsRepository: IGetAllStockBueItemsRepository,
    private readonly stockBueTlqvCacheRepository: IStockBueTlqvCacheRepository,
    private readonly getCurrentDate: () => Date = () => new Date(),
  ) {}

  async execute(
    command: RefreshStockBueTlqvCacheCommand = {},
  ): Promise<RefreshStockBueTlqvCacheResponse> {
    const pageSize = command.pageSize ?? DEFAULT_PAGE_SIZE;
    validatePositiveInteger(pageSize, 'pageSize');

    const stockBue = await this.getAllStockBueItemsRepository.getAll({
      pageSize,
    });
    const itemsByTlqvCode = new Map<string, StockBueTlqvCacheItem>();
    let totalRowsWithTlqv = 0;

    for (const row of stockBue.rows) {
      const tlqvCode = normalizeTlqvCode(row.data.TLQV);
      if (tlqvCode === undefined) {
        continue;
      }

      totalRowsWithTlqv += 1;
      if (!itemsByTlqvCode.has(tlqvCode)) {
        itemsByTlqvCode.set(tlqvCode, toCacheItem(tlqvCode, row));
      }
    }

    const items = [...itemsByTlqvCode.values()];
    const metadata: StockBueTlqvCacheMetadata = {
      refreshedAt: this.getCurrentDate().toISOString(),
      totalSheetRows: stockBue.totalRows,
      totalRowsWithTlqv,
      totalRowsWithoutTlqv: stockBue.totalRows - totalRowsWithTlqv,
      totalUniqueTlqv: items.length,
      instructionCounts: countInstructions(items),
    };

    await this.stockBueTlqvCacheRepository.replaceAll({
      items,
      metadata,
    });

    return {
      status: 'completed',
      ...metadata,
    };
  }
}

function toCacheItem(
  tlqvCode: string,
  row: StockBueItem,
): StockBueTlqvCacheItem {
  return {
    tlqvCode,
    rowNumber: row.rowNumber,
    instruction: normalizeText(row.data.Instruccion)?.toUpperCase(),
    saleNumber: normalizeText(row.data['N venta']),
    description: normalizeText(row.data['Descripción']),
    fechaRecepcion: normalizeText(row.data['Fecha recepcion']),
    fechaSalida: normalizeText(row.data['Fecha Salida']),
    fechaLimite: normalizeText(row.data['Fecha Limite']),
    fechaInstruccion: normalizeText(row.data['fecha Instruccion']),
    rawData: row.data,
  };
}

function countInstructions(
  items: StockBueTlqvCacheItem[],
): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    if (item.instruction === undefined) {
      return counts;
    }

    counts[item.instruction] = (counts[item.instruction] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === '' ? undefined : normalized;
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}
