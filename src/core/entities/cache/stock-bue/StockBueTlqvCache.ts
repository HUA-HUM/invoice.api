import type { StockBueItemData } from '../../spreadsheet-api/stock-bue/StockBueItems';

export interface StockBueTlqvCacheItem {
  tlqvCode: string;
  rowNumber: number;
  instruction?: string;
  saleNumber?: string;
  description?: string;
  fechaRecepcion?: string;
  fechaSalida?: string;
  fechaLimite?: string;
  fechaInstruccion?: string;
  rawData: StockBueItemData;
}

export interface ReplaceStockBueTlqvCacheCommand {
  items: StockBueTlqvCacheItem[];
  metadata: StockBueTlqvCacheMetadata;
}

export interface StockBueTlqvCacheMetadata {
  refreshedAt: string;
  totalSheetRows: number;
  totalRowsWithTlqv: number;
  totalRowsWithoutTlqv: number;
  totalUniqueTlqv: number;
  totalDispatchedRows: number;
  totalDispatchedRowsWithTlqv: number;
  totalDispatchedRowsWithoutTlqv: number;
  totalUniqueDispatchedTlqv: number;
  instructionCounts: Record<string, number>;
}

export interface StockBueTlqvCacheSnapshot {
  metadata?: StockBueTlqvCacheMetadata;
  items: StockBueTlqvCacheItem[];
}

export interface StockBueTlqvCacheLookup {
  metadata?: StockBueTlqvCacheMetadata;
  item?: StockBueTlqvCacheItem;
}
