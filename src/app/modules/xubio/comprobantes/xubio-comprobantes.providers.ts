import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IMadreXubioComprobantesRepository } from '../../../../core/adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import { CachedXubioAccessTokenProvider } from '../../../../core/driver/repository/xubio/auth/CachedXubioAccessTokenProvider';
import { GetAccessTokenRepository } from '../../../../core/driver/repository/xubio/auth/GetAccessTokenRepository';
import { GetComprobanteDetailRepository } from '../../../../core/driver/repository/xubio/comprobantes/GetComprobanteDetailRepository';
import { GetComprobantesByDateRepository } from '../../../../core/driver/repository/xubio/comprobantes/GetComprobantesByDateRepository';
import {
  BackfillXubioComprobantesInteractor,
  type BackfillXubioComprobantesLogger,
} from '../../../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import {
  readNumberConfig,
  readOptionalConfig,
  readRequiredConfig,
} from '../../shared/config/read-config';
import { createMadreXubioComprobantesRepository } from '../../shared/madre/madre-repositories.factory';
import { readXubioRetryOptions } from '../shared/xubio-cliente-repository.factory';

const DEFAULT_XUBIO_COMPROBANTES_LIST_LIMIT = 100;

export const MADRE_XUBIO_COMPROBANTES_REPOSITORY = Symbol(
  'MADRE_XUBIO_COMPROBANTES_REPOSITORY',
);
export const XUBIO_COMPROBANTES_DEFAULT_LIST_LIMIT = Symbol(
  'XUBIO_COMPROBANTES_DEFAULT_LIST_LIMIT',
);
export const BACKFILL_XUBIO_COMPROBANTES_INTERACTOR = Symbol(
  'BACKFILL_XUBIO_COMPROBANTES_INTERACTOR',
);

export const xubioComprobantesProviders: Provider[] = [
  {
    provide: MADRE_XUBIO_COMPROBANTES_REPOSITORY,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      createMadreXubioComprobantesRepository(configService),
  },
  {
    provide: XUBIO_COMPROBANTES_DEFAULT_LIST_LIMIT,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      readNumberConfig(
        configService,
        'XUBIO_COMPROBANTES_LIST_LIMIT',
        DEFAULT_XUBIO_COMPROBANTES_LIST_LIMIT,
      ),
  },
  {
    provide: BACKFILL_XUBIO_COMPROBANTES_INTERACTOR,
    inject: [
      ConfigService,
      MADRE_XUBIO_COMPROBANTES_REPOSITORY,
      XUBIO_COMPROBANTES_DEFAULT_LIST_LIMIT,
    ],
    useFactory: (
      configService: ConfigService,
      madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
      defaultXubioLimit: number,
    ) => {
      const xubioBaseUrl = readOptionalConfig(configService, 'XUBIO_BASE_URL');
      const retryOptions = readXubioRetryOptions(configService);
      const tokenRepository = new GetAccessTokenRepository({
        baseUrl: xubioBaseUrl,
        basicAuthorizationToken: readRequiredConfig(
          configService,
          'XUBIO_BASIC_AUTHORIZATION',
        ),
        retryOptions,
      });
      const tokenProvider = new CachedXubioAccessTokenProvider(tokenRepository);
      const accessTokenProvider = () => tokenProvider.getAccessToken();
      const onAuthorizationFailure = () =>
        tokenProvider.invalidateAccessToken();

      return new BackfillXubioComprobantesInteractor(
        new GetComprobantesByDateRepository({
          baseUrl: xubioBaseUrl,
          accessTokenProvider,
          onAuthorizationFailure,
          retryOptions,
        }),
        new GetComprobanteDetailRepository({
          baseUrl: xubioBaseUrl,
          accessTokenProvider,
          onAuthorizationFailure,
          retryOptions,
        }),
        madreXubioComprobantesRepository,
        () => new Date(),
        createBackfillLogger(),
        { defaultXubioLimit },
      );
    },
  },
];

function createBackfillLogger(): BackfillXubioComprobantesLogger {
  const logger = new Logger('XubioComprobantesBackfillService');

  return {
    info: (message, context) => logger.log(formatLogMessage(message, context)),
    warn: (message, context) => logger.warn(formatLogMessage(message, context)),
    error: (message, context) =>
      logger.error(formatLogMessage(message, context)),
  };
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
