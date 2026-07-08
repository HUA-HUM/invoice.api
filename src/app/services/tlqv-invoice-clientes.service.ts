import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MadreInvoiceClientIssuesRepository } from '../../core/driver/madre-api/invoice/client-issues/MadreInvoiceClientIssuesRepository';
import { MadreXubioComprobantesRepository } from '../../core/driver/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import { RedisStockBueTlqvCacheRepository } from '../../core/driver/redis/stock-bue/RedisStockBueTlqvCacheRepository';
import { GetFlokzuProcessInstanceRepository } from '../../core/driver/flokzu/process-instance/GetFlokzuProcessInstanceRepository';
import { GetTusFacturasAfipInfoRepository } from '../../core/driver/tus-facturas/afip-info/GetTusFacturasAfipInfoRepository';
import { CachedXubioAccessTokenProvider } from '../../core/driver/xubio/auth/CachedXubioAccessTokenProvider';
import { GetAccessTokenRepository } from '../../core/driver/xubio/auth/GetAccessTokenRepository';
import { CreateClienteRepository } from '../../core/driver/xubio/clientes/CreateClienteRepository';
import type { XubioRequestRetryOptions } from '../../core/driver/xubio/XubioRequestRetry';
import {
  CreateXubioConsumidorFinalClienteFromIssueInteractor,
  type CreateXubioConsumidorFinalClienteFromIssueCommand,
  type CreateXubioConsumidorFinalClienteFromIssueResponse,
} from '../../core/interactors/tlqv/CreateXubioConsumidorFinalClienteFromIssueInteractor';
import {
  CreateXubioClienteFromTlqvInteractor,
  type CreateXubioClienteFromTlqvCommand,
  type CreateXubioClienteFromTlqvResponse,
} from '../../core/interactors/tlqv/CreateXubioClienteFromTlqvInteractor';
import { RedisConnectionOptionsFactory } from './redis/redis-connection-options.factory';

@Injectable()
export class TlqvInvoiceClientesService implements OnModuleDestroy {
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    this.redisClient = this.redisConnectionOptionsFactory.createClient();
  }

  execute(
    command: CreateXubioClienteFromTlqvCommand,
  ): Promise<CreateXubioClienteFromTlqvResponse> {
    return this.createInteractor().execute(command);
  }

  createConsumidorFinalFromIssue(
    command: CreateXubioConsumidorFinalClienteFromIssueCommand,
  ): Promise<CreateXubioConsumidorFinalClienteFromIssueResponse> {
    return this.createConsumidorFinalFromIssueInteractor().execute(command);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient.quit();
  }

  private createInteractor(): CreateXubioClienteFromTlqvInteractor {
    const xubioBaseUrl = this.readOptionalConfig('XUBIO_BASE_URL');
    const retryOptions = this.readXubioRetryOptions();
    const tokenRepository = new GetAccessTokenRepository({
      baseUrl: xubioBaseUrl,
      basicAuthorizationToken: this.readRequiredConfig(
        'XUBIO_BASIC_AUTHORIZATION',
      ),
      retryOptions,
    });
    const tokenProvider = new CachedXubioAccessTokenProvider(tokenRepository);
    const accessTokenProvider = () => tokenProvider.getAccessToken();
    const onAuthorizationFailure = () => tokenProvider.invalidateAccessToken();

    return new CreateXubioClienteFromTlqvInteractor(
      new RedisStockBueTlqvCacheRepository({
        redisClient: this.redisClient,
        keyPrefix: this.readOptionalConfig('STOCK_BUE_TLQV_CACHE_KEY_PREFIX'),
      }),
      new MadreXubioComprobantesRepository({
        baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
        internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
        timeoutInMilliseconds: this.readNumberConfig(
          'MADRE_API_TIMEOUT_MS',
          20_000,
        ),
      }),
      new GetFlokzuProcessInstanceRepository({
        baseUrl: this.readOptionalConfig('FLOKZU_BASE_URL'),
        apiKey: this.readRequiredConfig('FLOKZU_API_KEY'),
        username: this.readRequiredConfig('FLOKZU_USERNAME'),
      }),
      new GetTusFacturasAfipInfoRepository({
        baseUrl: this.readOptionalConfig('TUS_FACTURAS_BASE_URL'),
        userToken: this.readRequiredConfig('TUS_FACTURAS_USER_TOKEN'),
        apiKey: this.readRequiredConfig('TUS_FACTURAS_API_KEY'),
        apiToken: this.readRequiredConfig('TUS_FACTURAS_API_TOKEN'),
        cookie: this.readOptionalConfig('TUS_FACTURAS_COOKIE'),
      }),
      new CreateClienteRepository({
        baseUrl: xubioBaseUrl,
        accessTokenProvider,
        onAuthorizationFailure,
        retryOptions,
      }),
      new MadreInvoiceClientIssuesRepository({
        baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
        internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
        timeoutInMilliseconds: this.readNumberConfig(
          'MADRE_API_TIMEOUT_MS',
          20_000,
        ),
      }),
      () => new Date(),
    );
  }

  private createConsumidorFinalFromIssueInteractor(): CreateXubioConsumidorFinalClienteFromIssueInteractor {
    const xubioBaseUrl = this.readOptionalConfig('XUBIO_BASE_URL');
    const retryOptions = this.readXubioRetryOptions();
    const tokenRepository = new GetAccessTokenRepository({
      baseUrl: xubioBaseUrl,
      basicAuthorizationToken: this.readRequiredConfig(
        'XUBIO_BASIC_AUTHORIZATION',
      ),
      retryOptions,
    });
    const tokenProvider = new CachedXubioAccessTokenProvider(tokenRepository);
    const accessTokenProvider = () => tokenProvider.getAccessToken();
    const onAuthorizationFailure = () => tokenProvider.invalidateAccessToken();

    return new CreateXubioConsumidorFinalClienteFromIssueInteractor(
      new MadreInvoiceClientIssuesRepository({
        baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
        internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
        timeoutInMilliseconds: this.readNumberConfig(
          'MADRE_API_TIMEOUT_MS',
          20_000,
        ),
      }),
      new CreateClienteRepository({
        baseUrl: xubioBaseUrl,
        accessTokenProvider,
        onAuthorizationFailure,
        retryOptions,
      }),
      () => new Date(),
    );
  }

  private readXubioRetryOptions(): XubioRequestRetryOptions {
    return {
      maxAttempts: this.readNumberConfig('XUBIO_REQUEST_RETRY_ATTEMPTS', 4),
      initialDelayInMilliseconds: this.readNumberConfig(
        'XUBIO_REQUEST_RETRY_INITIAL_DELAY_MS',
        1_000,
      ),
      maxDelayInMilliseconds: this.readNumberConfig(
        'XUBIO_REQUEST_RETRY_MAX_DELAY_MS',
        10_000,
      ),
    };
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

  private readNumberConfig(name: string, defaultValue: number): number {
    const value =
      this.readFromEnvFile(name) ?? this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return defaultValue;
    }

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new Error(`${name} must be a positive integer`);
    }

    return parsedValue;
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
