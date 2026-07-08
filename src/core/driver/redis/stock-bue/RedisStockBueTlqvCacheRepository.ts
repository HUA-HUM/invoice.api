import type { Redis } from 'ioredis';
import type { IStockBueTlqvCacheRepository } from '../../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type {
  ReplaceStockBueTlqvCacheCommand,
  StockBueTlqvCacheItem,
  StockBueTlqvCacheLookup,
  StockBueTlqvCacheMetadata,
  StockBueTlqvCacheSnapshot,
} from '../../../entities/cache/stock-bue/StockBueTlqvCache';

const DEFAULT_KEY_PREFIX = 'invoice-api:stock-bue:tlqv';

export interface RedisStockBueTlqvCacheRepositoryOptions {
  redisClient: Redis;
  keyPrefix?: string;
}

export class RedisStockBueTlqvCacheRepository implements IStockBueTlqvCacheRepository {
  private readonly redisClient: Redis;
  private readonly keyPrefix: string;

  constructor(options: RedisStockBueTlqvCacheRepositoryOptions) {
    this.redisClient = options.redisClient;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  async replaceAll(command: ReplaceStockBueTlqvCacheCommand): Promise<void> {
    const keys = this.keys();
    const previousInstructions = await this.redisClient.smembers(
      keys.instructions,
    );
    const instructionCodes = groupTlqvCodesByInstruction(command.items);
    const instructionKeysToDelete = new Set<string>();

    for (const instruction of previousInstructions) {
      instructionKeysToDelete.add(this.instructionKey(instruction));
    }
    for (const instruction of instructionCodes.keys()) {
      instructionKeysToDelete.add(this.instructionKey(instruction));
    }

    const transaction = this.redisClient.multi();

    transaction.del(
      keys.items,
      keys.metadata,
      keys.instructions,
      ...instructionKeysToDelete,
    );
    transaction.hset(keys.metadata, {
      value: JSON.stringify(command.metadata),
    });

    for (const item of command.items) {
      transaction.hset(keys.items, item.tlqvCode, JSON.stringify(item));
    }

    for (const [instruction, tlqvCodes] of instructionCodes.entries()) {
      const instructionKey = this.instructionKey(instruction);
      if (tlqvCodes.length > 0) {
        transaction.sadd(instructionKey, ...tlqvCodes);
      }
      transaction.sadd(keys.instructions, instruction);
    }

    await transaction.exec();
  }

  async getSnapshot(): Promise<StockBueTlqvCacheSnapshot> {
    const keys = this.keys();
    const [metadataJson, rawItems] = await Promise.all([
      this.redisClient.hget(keys.metadata, 'value'),
      this.redisClient.hgetall(keys.items),
    ]);

    return {
      metadata:
        metadataJson === null
          ? undefined
          : (JSON.parse(metadataJson) as StockBueTlqvCacheMetadata),
      items: Object.values(rawItems).map(
        (value) => JSON.parse(value) as StockBueTlqvCacheItem,
      ),
    };
  }

  async getByTlqvCode(tlqvCode: string): Promise<StockBueTlqvCacheLookup> {
    const keys = this.keys();
    const [metadataJson, itemJson] = await Promise.all([
      this.redisClient.hget(keys.metadata, 'value'),
      this.redisClient.hget(keys.items, tlqvCode),
    ]);

    return {
      metadata:
        metadataJson === null
          ? undefined
          : (JSON.parse(metadataJson) as StockBueTlqvCacheMetadata),
      item:
        itemJson === null
          ? undefined
          : (JSON.parse(itemJson) as StockBueTlqvCacheItem),
    };
  }

  private keys(): { items: string; metadata: string; instructions: string } {
    return {
      items: `${this.keyPrefix}:items`,
      metadata: `${this.keyPrefix}:metadata`,
      instructions: `${this.keyPrefix}:instructions`,
    };
  }

  private instructionKey(instruction: string): string {
    return `${this.keyPrefix}:instruction:${instruction}`;
  }
}

function groupTlqvCodesByInstruction(
  items: StockBueTlqvCacheItem[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const item of items) {
    if (item.instruction === undefined) {
      continue;
    }

    groups.set(item.instruction, [
      ...(groups.get(item.instruction) ?? []),
      item.tlqvCode,
    ]);
  }

  return groups;
}
