import type {
  ReplaceStockBueTlqvCacheCommand,
  StockBueTlqvCacheSnapshot,
} from '../../../../entities/cache/stock-bue/StockBueTlqvCache';

export interface IStockBueTlqvCacheRepository {
  replaceAll(command: ReplaceStockBueTlqvCacheCommand): Promise<void>;

  getSnapshot(): Promise<StockBueTlqvCacheSnapshot>;
}
