import { ConfigService } from '@nestjs/config';
import { CachedXubioAccessTokenProvider } from '../../../../core/driver/repository/xubio/auth/CachedXubioAccessTokenProvider';
import { GetAccessTokenRepository } from '../../../../core/driver/repository/xubio/auth/GetAccessTokenRepository';
import { CreateClienteRepository } from '../../../../core/driver/repository/xubio/clientes/CreateClienteRepository';
import type { XubioRequestRetryOptions } from '../../../../core/driver/repository/xubio/XubioRequestRetry';
import {
  readNumberConfig,
  readOptionalConfig,
  readRequiredConfig,
} from '../../shared/config/read-config';

export function createXubioCreateClienteRepository(
  configService: ConfigService,
): CreateClienteRepository {
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
  const onAuthorizationFailure = () => tokenProvider.invalidateAccessToken();

  return new CreateClienteRepository({
    baseUrl: xubioBaseUrl,
    accessTokenProvider,
    onAuthorizationFailure,
    retryOptions,
  });
}

export function readXubioRetryOptions(
  configService: ConfigService,
): XubioRequestRetryOptions {
  return {
    maxAttempts: readNumberConfig(
      configService,
      'XUBIO_REQUEST_RETRY_ATTEMPTS',
      6,
    ),
    initialDelayInMilliseconds: readNumberConfig(
      configService,
      'XUBIO_REQUEST_RETRY_INITIAL_DELAY_MS',
      2_000,
    ),
    maxDelayInMilliseconds: readNumberConfig(
      configService,
      'XUBIO_REQUEST_RETRY_MAX_DELAY_MS',
      30_000,
    ),
  };
}
