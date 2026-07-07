import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { StockBueTlqvCacheItem } from '../../entities/cache/stock-bue/StockBueTlqvCache';
import {
  STOCK_BUE_DISPATCHED_INSTRUCTION,
  type StockBueItemData,
} from '../../entities/spreadsheet-api/stock-bue/StockBueItems';

const DEFAULT_COMPROBANTES_BATCH_SIZE = 500;

export interface FindUnbilledDispatchedStockBueTlqvCommand {
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
  cacheRefreshedAt: string;
  totalCacheTlqv: number;
  totalSheetRows: number;
  totalDispatchedRows: number;
  totalDispatchedRowsWithoutTlqv: number;
  totalUniqueDispatchedTlqv: number;
  totalBilledTlqv: number;
  totalUnbilledTlqv: number;
  items: UnbilledDispatchedStockBueTlqvItem[];
}

export class StockBueTlqvCacheNotReadyError extends Error {
  constructor() {
    super('Stock BUE TLQV cache is not ready. Refresh the cache first.');
    this.name = StockBueTlqvCacheNotReadyError.name;
  }
}

export class FindUnbilledDispatchedStockBueTlqvInteractor {
  constructor(
    private readonly stockBueTlqvCacheRepository: IStockBueTlqvCacheRepository,
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
  ) {}

  async execute(
    command: FindUnbilledDispatchedStockBueTlqvCommand = {},
  ): Promise<FindUnbilledDispatchedStockBueTlqvResponse> {
    const comprobantesBatchSize =
      command.comprobantesBatchSize ?? DEFAULT_COMPROBANTES_BATCH_SIZE;
    validatePositiveInteger(comprobantesBatchSize, 'comprobantesBatchSize');

    const snapshot = await this.stockBueTlqvCacheRepository.getSnapshot();
    if (snapshot.metadata === undefined) {
      throw new StockBueTlqvCacheNotReadyError();
    }

    const itemsByTlqvCode = groupDispatchedItemsByTlqvCode(snapshot.items);
    const tlqvCodes = [...itemsByTlqvCode.keys()];
    const billedTlqvCodes = await this.findBilledTlqvCodes(
      tlqvCodes,
      comprobantesBatchSize,
    );

    const items = tlqvCodes
      .filter((tlqvCode) => !billedTlqvCodes.has(tlqvCode))
      .map((tlqvCode) => toUnbilledItem(tlqvCode, itemsByTlqvCode));

    return {
      status: 'completed',
      instruction: STOCK_BUE_DISPATCHED_INSTRUCTION,
      cacheRefreshedAt: snapshot.metadata.refreshedAt,
      totalCacheTlqv: snapshot.items.length,
      totalSheetRows: snapshot.metadata.totalSheetRows,
      totalDispatchedRows:
        snapshot.metadata.totalDispatchedRows ?? itemsByTlqvCode.size,
      totalDispatchedRowsWithoutTlqv:
        snapshot.metadata.totalDispatchedRowsWithoutTlqv ?? 0,
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
        if (
          item.documentKind !== undefined &&
          item.documentKind !== null &&
          item.documentKind !== 'INVOICE'
        ) {
          continue;
        }

        const tlqvCode = normalizeTlqvCode(item.tlqvCode);
        if (tlqvCode !== undefined) {
          billedCodes.add(tlqvCode);
        }
      }
    }

    return billedCodes;
  }
}

function groupDispatchedItemsByTlqvCode(
  items: StockBueTlqvCacheItem[],
): Map<string, StockBueTlqvCacheItem> {
  const itemsByTlqvCode = new Map<string, StockBueTlqvCacheItem>();

  for (const item of items) {
    if (
      normalizeInstruction(item.instruction) !==
      STOCK_BUE_DISPATCHED_INSTRUCTION
    ) {
      continue;
    }

    const tlqvCode = normalizeTlqvCode(item.tlqvCode);
    if (tlqvCode === undefined || itemsByTlqvCode.has(tlqvCode)) {
      continue;
    }

    itemsByTlqvCode.set(tlqvCode, item);
  }

  return itemsByTlqvCode;
}

function toUnbilledItem(
  tlqvCode: string,
  itemsByTlqvCode: Map<string, StockBueTlqvCacheItem>,
): UnbilledDispatchedStockBueTlqvItem {
  const item = itemsByTlqvCode.get(tlqvCode);
  if (item === undefined) {
    throw new Error(`TLQV ${tlqvCode} was not found in stock-bue cache`);
  }

  return {
    tlqvCode,
    rowNumber: item.rowNumber,
    saleNumber: item.saleNumber,
    description: item.description,
    instruction: STOCK_BUE_DISPATCHED_INSTRUCTION,
    fechaRecepcion: item.fechaRecepcion,
    fechaSalida: item.fechaSalida,
    fechaLimite: item.fechaLimite,
    fechaInstruccion: item.fechaInstruccion,
    rawData: item.rawData,
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

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}
