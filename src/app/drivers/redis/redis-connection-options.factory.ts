import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import Redis, { type RedisOptions } from 'ioredis';

const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_REDIS_KEEP_ALIVE_MS = 30_000;
const DEFAULT_REDIS_RETRY_MAX_DELAY_MS = 2_000;

@Injectable()
export class RedisConnectionOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  build(): ConnectionOptions {
    const baseOptions = this.buildBaseOptions();
    const redisUrl = this.readOptionalConfig('REDIS_URL');
    if (redisUrl !== undefined) {
      return {
        url: redisUrl,
        ...baseOptions,
      };
    }

    const username = this.readOptionalConfig('REDIS_USERNAME');
    const password = this.readOptionalConfig('REDIS_PASSWORD');

    return {
      ...baseOptions,
      host: this.readOptionalConfig('REDIS_HOST') ?? '127.0.0.1',
      port: this.readNumberConfig('REDIS_PORT', 6379),
      db: this.readNumberConfig('REDIS_DB', 0),
      username,
      password,
      tls: this.readBooleanConfig('REDIS_TLS', false) ? {} : undefined,
    };
  }

  createClient(): Redis {
    const baseOptions = this.buildBaseOptions();
    const redisUrl = this.readOptionalConfig('REDIS_URL');
    if (redisUrl !== undefined) {
      return new Redis(redisUrl, baseOptions);
    }

    return new Redis(this.buildIORedisOptions());
  }

  private buildIORedisOptions(): RedisOptions {
    const username = this.readOptionalConfig('REDIS_USERNAME');
    const password = this.readOptionalConfig('REDIS_PASSWORD');

    return {
      ...this.buildBaseOptions(),
      host: this.readOptionalConfig('REDIS_HOST') ?? '127.0.0.1',
      port: this.readNumberConfig('REDIS_PORT', 6379),
      db: this.readNumberConfig('REDIS_DB', 0),
      username,
      password,
      tls: this.readBooleanConfig('REDIS_TLS', false) ? {} : undefined,
    };
  }

  private buildBaseOptions(): RedisOptions {
    const retryMaxDelayInMilliseconds = this.readNumberConfig(
      'REDIS_RETRY_MAX_DELAY_MS',
      DEFAULT_REDIS_RETRY_MAX_DELAY_MS,
    );

    return {
      connectTimeout: this.readNumberConfig(
        'REDIS_CONNECT_TIMEOUT_MS',
        DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
      ),
      keepAlive: this.readNumberConfig(
        'REDIS_KEEP_ALIVE_MS',
        DEFAULT_REDIS_KEEP_ALIVE_MS,
      ),
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) =>
        Math.min(times * 250, retryMaxDelayInMilliseconds),
    };
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }

  private readNumberConfig(name: string, defaultValue: number): number {
    const rawValue = this.readOptionalConfig(name);
    if (rawValue === undefined) {
      return defaultValue;
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a positive integer`);
    }

    return value;
  }

  private readBooleanConfig(name: string, defaultValue: boolean): boolean {
    const rawValue = this.readOptionalConfig(name);
    if (rawValue === undefined) {
      return defaultValue;
    }

    return ['1', 'true', 'yes', 'y'].includes(rawValue.toLowerCase());
  }
}
