import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetAllStockBueItemsRepository } from '../../../core/driver/repository/spreadsheet-api/stock-bue/GetAllStockBueItemsRepository';
import { GetOneStockBueItemsRepository } from '../../../core/driver/repository/spreadsheet-api/stock-bue/GetOneStockBueItemsRepository';
import { FindUnbilledDispatchedStockBueTlqvInteractor } from '../../../core/interactors/stock-bue/FindUnbilledDispatchedStockBueTlqvInteractor';
import { RefreshStockBueTlqvCacheInteractor } from '../../../core/interactors/stock-bue/RefreshStockBueTlqvCacheInteractor';
import { StockBueTlqvCacheManagerRepository } from '../../drivers/cache/stock-bue/stock-bue-tlqv-cache-manager.repository';
import {
  readNumberConfig,
  readOptionalConfig,
} from '../shared/config/read-config';
import { createMadreXubioComprobantesRepository } from '../shared/madre/madre-repositories.factory';

export const REFRESH_STOCK_BUE_TLQV_CACHE_INTERACTOR = Symbol(
  'REFRESH_STOCK_BUE_TLQV_CACHE_INTERACTOR',
);
export const FIND_UNBILLED_DISPATCHED_STOCK_BUE_TLQV_INTERACTOR = Symbol(
  'FIND_UNBILLED_DISPATCHED_STOCK_BUE_TLQV_INTERACTOR',
);

export const stockBueInteractorProviders: Provider[] = [
  {
    provide: REFRESH_STOCK_BUE_TLQV_CACHE_INTERACTOR,
    inject: [ConfigService, StockBueTlqvCacheManagerRepository],
    useFactory: (
      configService: ConfigService,
      stockBueTlqvCacheRepository: StockBueTlqvCacheManagerRepository,
    ) => {
      const getOneStockBueItemsRepository = new GetOneStockBueItemsRepository({
        baseUrl: readOptionalConfig(configService, 'SPREADSHEET_API_BASE_URL'),
        timeoutInMilliseconds: readNumberConfig(
          configService,
          'SPREADSHEET_API_TIMEOUT_MS',
          20_000,
        ),
        requestAttempts: readNumberConfig(
          configService,
          'SPREADSHEET_API_REQUEST_ATTEMPTS',
          3,
        ),
        retryDelayInMilliseconds: readNumberConfig(
          configService,
          'SPREADSHEET_API_RETRY_DELAY_MS',
          1_000,
        ),
      });
      const getAllStockBueItemsRepository = new GetAllStockBueItemsRepository(
        getOneStockBueItemsRepository,
      );

      return new RefreshStockBueTlqvCacheInteractor(
        getAllStockBueItemsRepository,
        stockBueTlqvCacheRepository,
        () => new Date(),
      );
    },
  },
  {
    provide: FIND_UNBILLED_DISPATCHED_STOCK_BUE_TLQV_INTERACTOR,
    inject: [ConfigService, StockBueTlqvCacheManagerRepository],
    useFactory: (
      configService: ConfigService,
      stockBueTlqvCacheRepository: StockBueTlqvCacheManagerRepository,
    ) =>
      new FindUnbilledDispatchedStockBueTlqvInteractor(
        stockBueTlqvCacheRepository,
        createMadreXubioComprobantesRepository(configService),
      ),
  },
];
