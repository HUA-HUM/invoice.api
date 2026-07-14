import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Cache, createCache } from 'cache-manager';
import type {
  ReplaceStockBueTlqvCacheCommand,
  StockBueTlqvCacheItem,
  StockBueTlqvCacheLookup,
  StockBueTlqvCacheMetadata,
  StockBueTlqvCacheSnapshot,
} from '../../../../core/entities/cache/stock-bue/StockBueTlqvCache';
import { IStockBueTlqvCacheRepository } from '../../../../core/adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';

const DEFAULT_KEY_PREFIX = 'invoice-api:stock-bue:tlqv';

interface StockBueTlqvCachePayload {
  metadata: StockBueTlqvCacheMetadata;
  itemsByTlqvCode: Record<string, StockBueTlqvCacheItem>;
}

@Injectable()
export class StockBueTlqvCacheManagerRepository
  implements IStockBueTlqvCacheRepository, OnModuleDestroy
{
  private readonly cache: Cache;
  private readonly keyPrefix: string;
  private readonly ttlInMilliseconds?: number;

  constructor(private readonly configService: ConfigService) {
    this.cache = createCache();
    this.keyPrefix =
      this.readOptionalConfig('STOCK_BUE_TLQV_CACHE_KEY_PREFIX') ??
      DEFAULT_KEY_PREFIX;
    this.ttlInMilliseconds = this.readOptionalPositiveIntegerConfig(
      'STOCK_BUE_TLQV_CACHE_TTL_MS',
    );
  }

  async replaceAll(command: ReplaceStockBueTlqvCacheCommand): Promise<void> {
    const payload: StockBueTlqvCachePayload = {
      metadata: command.metadata,
      itemsByTlqvCode: buildItemsByTlqvCode(command.items),
    };

    await this.cache.set(this.payloadKey(), payload, this.ttlInMilliseconds);
  }

  async getSnapshot(): Promise<StockBueTlqvCacheSnapshot> {
    const payload = await this.getPayload();

    return {
      metadata: payload?.metadata,
      items:
        payload === undefined ? [] : Object.values(payload.itemsByTlqvCode),
    };
  }

  async getByTlqvCode(tlqvCode: string): Promise<StockBueTlqvCacheLookup> {
    const payload = await this.getPayload();
    const normalizedTlqvCode = normalizeTlqvCode(tlqvCode);

    return {
      metadata: payload?.metadata,
      item: payload?.itemsByTlqvCode[normalizedTlqvCode],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.cache.disconnect();
  }

  private getPayload(): Promise<StockBueTlqvCachePayload | undefined> {
    return this.cache.get<StockBueTlqvCachePayload>(this.payloadKey());
  }

  private payloadKey(): string {
    return `${this.keyPrefix}:payload`;
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    return value.trim();
  }

  private readOptionalPositiveIntegerConfig(name: string): number | undefined {
    const value = this.readOptionalConfig(name);
    if (value === undefined) {
      return undefined;
    }

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new Error(`${name} must be a positive integer`);
    }

    return parsedValue;
  }
}

function buildItemsByTlqvCode(
  items: StockBueTlqvCacheItem[],
): Record<string, StockBueTlqvCacheItem> {
  const itemsByTlqvCode: Record<string, StockBueTlqvCacheItem> = {};

  for (const item of items) {
    itemsByTlqvCode[normalizeTlqvCode(item.tlqvCode)] = item;
  }

  return itemsByTlqvCode;
}

function normalizeTlqvCode(value: string): string {
  return value.trim().toUpperCase();
}
