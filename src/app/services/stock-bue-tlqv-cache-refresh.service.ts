import { Inject, Injectable } from '@nestjs/common';
import {
  RefreshStockBueTlqvCacheInteractor,
  type RefreshStockBueTlqvCacheCommand,
  type RefreshStockBueTlqvCacheResponse,
} from '../../core/interactors/stock-bue/RefreshStockBueTlqvCacheInteractor';
import { REFRESH_STOCK_BUE_TLQV_CACHE_INTERACTOR } from '../modules/stock-bue/stock-bue.providers';

@Injectable()
export class StockBueTlqvCacheRefreshService {
  constructor(
    @Inject(REFRESH_STOCK_BUE_TLQV_CACHE_INTERACTOR)
    private readonly interactor: RefreshStockBueTlqvCacheInteractor,
  ) {}

  execute(
    command: RefreshStockBueTlqvCacheCommand = {},
  ): Promise<RefreshStockBueTlqvCacheResponse> {
    return this.interactor.execute(command);
  }
}
