import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { RedisStockBueTlqvCacheRepository } from '../../core/driver/redis/stock-bue/RedisStockBueTlqvCacheRepository';
import { MadreXubioComprobantesRepository } from '../../core/driver/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import {
  PrepareTlqvInvoiceInteractor,
  type PrepareTlqvInvoiceCommand,
  type PrepareTlqvInvoiceResponse,
} from '../../core/interactors/tlqv/PrepareTlqvInvoiceInteractor';
import { RedisConnectionOptionsFactory } from './redis/redis-connection-options.factory';

@Injectable()
export class TlqvInvoicePreparationService implements OnModuleDestroy {
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    this.redisClient = this.redisConnectionOptionsFactory.createClient();
  }

  execute(
    command: PrepareTlqvInvoiceCommand,
  ): Promise<PrepareTlqvInvoiceResponse> {
    return this.createInteractor().execute(command);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient.quit();
  }

  private createInteractor(): PrepareTlqvInvoiceInteractor {
    const stockBueTlqvCacheRepository = new RedisStockBueTlqvCacheRepository({
      redisClient: this.redisClient,
      keyPrefix: this.readOptionalConfig('STOCK_BUE_TLQV_CACHE_KEY_PREFIX'),
    });
    const madreXubioComprobantesRepository =
      new MadreXubioComprobantesRepository({
        baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
        internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
        timeoutInMilliseconds: this.readNumberConfig(
          'MADRE_API_TIMEOUT_MS',
          20_000,
        ),
      });

    return new PrepareTlqvInvoiceInteractor(
      stockBueTlqvCacheRepository,
      madreXubioComprobantesRepository,
    );
  }

  private readRequiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      throw new Error(`${name} environment variable is required`);
    }
    return value.trim();
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }

  private readNumberConfig(name: string, defaultValue: number): number {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return defaultValue;
    }

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new Error(`${name} must be a positive integer`);
    }

    return parsedValue;
  }
}
