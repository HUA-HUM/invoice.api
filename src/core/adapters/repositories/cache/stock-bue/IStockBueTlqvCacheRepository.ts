import type {
  ReplaceStockBueTlqvCacheCommand,
  StockBueTlqvCacheLookup,
  StockBueTlqvCacheSnapshot,
} from '../../../../entities/cache/stock-bue/StockBueTlqvCache';

export interface IStockBueTlqvCacheRepository {
  replaceAll(command: ReplaceStockBueTlqvCacheCommand): Promise<void>;

  getSnapshot(): Promise<StockBueTlqvCacheSnapshot>;

  getByTlqvCode(tlqvCode: string): Promise<StockBueTlqvCacheLookup>;
}
