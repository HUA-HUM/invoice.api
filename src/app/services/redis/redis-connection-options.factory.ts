import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import Redis, { type RedisOptions } from 'ioredis';

@Injectable()
export class RedisConnectionOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  build(): ConnectionOptions {
    const redisUrl = this.readOptionalConfig('REDIS_URL');
    if (redisUrl !== undefined) {
      return {
        url: redisUrl,
        maxRetriesPerRequest: null,
      };
    }

    const username = this.readOptionalConfig('REDIS_USERNAME');
    const password = this.readOptionalConfig('REDIS_PASSWORD');

    return {
      host: this.readOptionalConfig('REDIS_HOST') ?? '127.0.0.1',
      port: this.readNumberConfig('REDIS_PORT', 6379),
      db: this.readNumberConfig('REDIS_DB', 0),
      username,
      password,
      tls: this.readBooleanConfig('REDIS_TLS', false) ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  createClient(): Redis {
    const redisUrl = this.readOptionalConfig('REDIS_URL');
    if (redisUrl !== undefined) {
      return new Redis(redisUrl, {
        maxRetriesPerRequest: null,
      });
    }

    return new Redis(this.buildIORedisOptions());
  }

  private buildIORedisOptions(): RedisOptions {
    const username = this.readOptionalConfig('REDIS_USERNAME');
    const password = this.readOptionalConfig('REDIS_PASSWORD');

    return {
      host: this.readOptionalConfig('REDIS_HOST') ?? '127.0.0.1',
      port: this.readNumberConfig('REDIS_PORT', 6379),
      db: this.readNumberConfig('REDIS_DB', 0),
      username,
      password,
      tls: this.readBooleanConfig('REDIS_TLS', false) ? {} : undefined,
      maxRetriesPerRequest: null,
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
