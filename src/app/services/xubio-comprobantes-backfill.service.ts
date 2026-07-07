import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MadreXubioComprobantesRepository } from '../../core/driver/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import { CachedXubioAccessTokenProvider } from '../../core/driver/xubio/auth/CachedXubioAccessTokenProvider';
import { GetAccessTokenRepository } from '../../core/driver/xubio/auth/GetAccessTokenRepository';
import { GetComprobanteDetailRepository } from '../../core/driver/xubio/comprobantes/GetComprobanteDetailRepository';
import { GetComprobantesByDateRepository } from '../../core/driver/xubio/comprobantes/GetComprobantesByDateRepository';
import {
  BackfillXubioComprobantesInteractor,
  buildSyncRunMetadata,
  type BackfillXubioComprobantesCommand,
  type BackfillXubioComprobantesResponse,
  normalizeBackfillXubioComprobantesCommand,
  type NormalizedBackfillXubioComprobantesCommand,
} from '../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import type { XubioRequestRetryOptions } from '../../core/driver/xubio/XubioRequestRetry';

const DEFAULT_XUBIO_COMPROBANTES_LIST_LIMIT = 100;

export interface CreatedXubioComprobantesBackfillSyncRun {
  syncRunId: number;
  command: NormalizedBackfillXubioComprobantesCommand;
}

@Injectable()
export class XubioComprobantesBackfillService {
  private readonly logger = new Logger(XubioComprobantesBackfillService.name);

  constructor(private readonly configService: ConfigService) {}

  async execute(
    command: BackfillXubioComprobantesCommand,
  ): Promise<BackfillXubioComprobantesResponse> {
    const interactor = this.createInteractor();

    return interactor.execute(command);
  }

  async createSyncRun(
    command: BackfillXubioComprobantesCommand,
  ): Promise<CreatedXubioComprobantesBackfillSyncRun> {
    const defaultXubioLimit = this.readXubioComprobantesListLimit();
    const normalizedCommand = normalizeBackfillXubioComprobantesCommand(
      command,
      () => new Date(),
      { defaultXubioLimit },
    );
    const madreXubioComprobantesRepository =
      this.createMadreXubioComprobantesRepository();

    const syncRun = await madreXubioComprobantesRepository.createSyncRun({
      syncType: 'historical_backfill',
      status: 'running',
      fechaDesde: normalizedCommand.fechaDesde,
      fechaHasta: normalizedCommand.fechaHasta,
      windowType: 'custom',
      metadata: buildSyncRunMetadata(
        normalizedCommand.batchSize,
        normalizedCommand.windowSizeDays,
        'queued',
        normalizedCommand.xubioLimit,
      ),
    });

    return {
      syncRunId: syncRun.id,
      command: {
        fechaDesde: normalizedCommand.fechaDesde,
        fechaHasta: normalizedCommand.fechaHasta,
        batchSize: normalizedCommand.batchSize,
        windowSizeDays: normalizedCommand.windowSizeDays,
        xubioLimit: normalizedCommand.xubioLimit,
      },
    };
  }

  async failSyncRun(syncRunId: number, errorMessage: string): Promise<void> {
    const madreXubioComprobantesRepository =
      this.createMadreXubioComprobantesRepository();

    await madreXubioComprobantesRepository.updateSyncRun({
      id: syncRunId,
      status: 'failed',
      totalListed: 0,
      totalDetailRequests: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalFailed: 0,
      hasSaturatedWindows: false,
      errorMessage,
      finishedAt: new Date().toISOString(),
    });
  }

  private createInteractor(): BackfillXubioComprobantesInteractor {
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

    const getComprobantesByDateRepository = new GetComprobantesByDateRepository(
      {
        baseUrl: xubioBaseUrl,
        accessTokenProvider,
        onAuthorizationFailure,
        retryOptions,
      },
    );
    const getComprobanteDetailRepository = new GetComprobanteDetailRepository({
      baseUrl: xubioBaseUrl,
      accessTokenProvider,
      onAuthorizationFailure,
      retryOptions,
    });
    const madreXubioComprobantesRepository =
      this.createMadreXubioComprobantesRepository();

    return new BackfillXubioComprobantesInteractor(
      getComprobantesByDateRepository,
      getComprobanteDetailRepository,
      madreXubioComprobantesRepository,
      () => new Date(),
      {
        info: (message, context) =>
          this.logger.log(formatLogMessage(message, context)),
        warn: (message, context) =>
          this.logger.warn(formatLogMessage(message, context)),
        error: (message, context) =>
          this.logger.error(formatLogMessage(message, context)),
      },
      { defaultXubioLimit: this.readXubioComprobantesListLimit() },
    );
  }

  private createMadreXubioComprobantesRepository(): MadreXubioComprobantesRepository {
    const madreBaseUrl = this.readRequiredConfig('MADRE_API_BASE_URL');
    const madreInternalApiKey = this.readRequiredConfig(
      'MADRE_INTERNAL_API_KEY',
    );

    return new MadreXubioComprobantesRepository({
      baseUrl: madreBaseUrl,
      internalApiKey: madreInternalApiKey,
    });
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

  private readXubioComprobantesListLimit(): number {
    return this.readNumberConfig(
      'XUBIO_COMPROBANTES_LIST_LIMIT',
      DEFAULT_XUBIO_COMPROBANTES_LIST_LIMIT,
    );
  }

  private readNumberConfig(name: string, defaultValue: number): number {
    const value =
      this.readFromEnvFile(name) ?? this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return defaultValue;
    }

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue < 0) {
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

function formatLogMessage(
  message: string,
  context?: Record<string, unknown>,
): string {
  if (context === undefined) {
    return message;
  }

  return `${message} ${JSON.stringify(context)}`;
}
