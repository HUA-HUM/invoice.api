import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MadreXubioComprobantesRepository } from '../../core/driver/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import { RedisStockBueTlqvCacheRepository } from '../../core/driver/redis/stock-bue/RedisStockBueTlqvCacheRepository';
import {
  FindUnbilledDispatchedStockBueTlqvInteractor,
  type FindUnbilledDispatchedStockBueTlqvCommand,
  type FindUnbilledDispatchedStockBueTlqvResponse,
} from '../../core/interactors/stock-bue/FindUnbilledDispatchedStockBueTlqvInteractor';
import { RedisConnectionOptionsFactory } from './redis/redis-connection-options.factory';

@Injectable()
export class StockBueTlqvAuditService implements OnModuleDestroy {
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    this.redisClient = this.redisConnectionOptionsFactory.createClient();
  }

  execute(
    command: FindUnbilledDispatchedStockBueTlqvCommand,
  ): Promise<FindUnbilledDispatchedStockBueTlqvResponse> {
    return this.createInteractor().execute(command);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient.quit();
  }

  private createInteractor(): FindUnbilledDispatchedStockBueTlqvInteractor {
    const stockBueTlqvCacheRepository = new RedisStockBueTlqvCacheRepository({
      redisClient: this.redisClient,
      keyPrefix: this.readOptionalConfig('STOCK_BUE_TLQV_CACHE_KEY_PREFIX'),
    });
    const madreXubioComprobantesRepository =
      new MadreXubioComprobantesRepository({
        baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
        internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
      });

    return new FindUnbilledDispatchedStockBueTlqvInteractor(
      stockBueTlqvCacheRepository,
      madreXubioComprobantesRepository,
    );
  }

  private readRequiredConfig(name: string): string {
    const value =
      this.readFromEnvFile(name) ?? this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      throw new Error(`${name} environment variable is required`);
    }
    return value.trim();
  }

  private readOptionalConfig(name: string): string | undefined {
    const value =
      this.readFromEnvFile(name) ?? this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }

  private readFromEnvFile(name: string): string | undefined {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) {
      return undefined;
    }

    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (key !== name) {
        continue;
      }

      return stripEnvValueQuotes(trimmed.slice(separatorIndex + 1).trim());
    }

    return undefined;
  }
}

function stripEnvValueQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
