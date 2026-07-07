import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { RedisStockBueTlqvCacheRepository } from '../../core/driver/redis/stock-bue/RedisStockBueTlqvCacheRepository';
import { GetAllStockBueItemsRepository } from '../../core/driver/spreadsheet-api/stock-bue/GetAllStockBueItemsRepository';
import { GetOneStockBueItemsRepository } from '../../core/driver/spreadsheet-api/stock-bue/GetOneStockBueItemsRepository';
import {
  RefreshStockBueTlqvCacheInteractor,
  type RefreshStockBueTlqvCacheCommand,
  type RefreshStockBueTlqvCacheResponse,
} from '../../core/interactors/stock-bue/RefreshStockBueTlqvCacheInteractor';
import { RedisConnectionOptionsFactory } from './redis/redis-connection-options.factory';

@Injectable()
export class StockBueTlqvCacheRefreshService implements OnModuleDestroy {
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    this.redisClient = this.redisConnectionOptionsFactory.createClient();
  }

  execute(
    command: RefreshStockBueTlqvCacheCommand = {},
  ): Promise<RefreshStockBueTlqvCacheResponse> {
    return this.createInteractor().execute(command);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient.quit();
  }

  private createInteractor(): RefreshStockBueTlqvCacheInteractor {
    const getOneStockBueItemsRepository = new GetOneStockBueItemsRepository({
      baseUrl: this.readOptionalConfig('SPREADSHEET_API_BASE_URL'),
    });
    const getAllStockBueItemsRepository = new GetAllStockBueItemsRepository(
      getOneStockBueItemsRepository,
    );
    const stockBueTlqvCacheRepository = new RedisStockBueTlqvCacheRepository({
      redisClient: this.redisClient,
      keyPrefix: this.readOptionalConfig('STOCK_BUE_TLQV_CACHE_KEY_PREFIX'),
    });

    return new RefreshStockBueTlqvCacheInteractor(
      getAllStockBueItemsRepository,
      stockBueTlqvCacheRepository,
      () => new Date(),
    );
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }
}
