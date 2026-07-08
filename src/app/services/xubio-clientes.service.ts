import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CreateXubioClienteFromFiscalInfoCommand } from '../../core/entities/xubio/clientes/XubioCliente';
import type { CreateXubioClienteFromFiscalInfoResponse } from '../../core/entities/xubio/clientes/XubioCliente';
import { MadreInvoiceClientIssuesRepository } from '../../core/driver/madre-api/invoice/client-issues/MadreInvoiceClientIssuesRepository';
import { CreateClienteRepository } from '../../core/driver/xubio/clientes/CreateClienteRepository';
import { CachedXubioAccessTokenProvider } from '../../core/driver/xubio/auth/CachedXubioAccessTokenProvider';
import { GetAccessTokenRepository } from '../../core/driver/xubio/auth/GetAccessTokenRepository';
import type { XubioRequestRetryOptions } from '../../core/driver/xubio/XubioRequestRetry';
import { CreateXubioClienteInteractor } from '../../core/interactors/xubio/clientes/CreateXubioClienteInteractor';

@Injectable()
export class XubioClientesService {
  constructor(private readonly configService: ConfigService) {}

  execute(
    command: CreateXubioClienteFromFiscalInfoCommand,
  ): Promise<CreateXubioClienteFromFiscalInfoResponse> {
    return this.createInteractor().execute(command);
  }

  private createInteractor(): CreateXubioClienteInteractor {
    const xubioBaseUrl = this.readOptionalConfig('XUBIO_BASE_URL');
    const basicAuthorizationToken = this.readRequiredConfig(
      'XUBIO_BASIC_AUTHORIZATION',
    );
    const retryOptions = this.readXubioRetryOptions();

    const tokenRepository = new GetAccessTokenRepository({
      baseUrl: xubioBaseUrl,
      basicAuthorizationToken,
      retryOptions,
    });
    const tokenProvider = new CachedXubioAccessTokenProvider(tokenRepository);
    const accessTokenProvider = () => tokenProvider.getAccessToken();
    const onAuthorizationFailure = () => tokenProvider.invalidateAccessToken();

    const createClienteRepository = new CreateClienteRepository({
      baseUrl: xubioBaseUrl,
      accessTokenProvider,
      onAuthorizationFailure,
      retryOptions,
    });
    const issueRepository = new MadreInvoiceClientIssuesRepository({
      baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
      internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
      timeoutInMilliseconds: this.readNumberConfig(
        'MADRE_API_TIMEOUT_MS',
        20_000,
      ),
    });

    return new CreateXubioClienteInteractor(
      createClienteRepository,
      issueRepository,
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
