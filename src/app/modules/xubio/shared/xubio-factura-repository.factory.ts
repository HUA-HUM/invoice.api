import { ConfigService } from '@nestjs/config';
import { CachedXubioAccessTokenProvider } from '../../../../core/driver/repository/xubio/auth/CachedXubioAccessTokenProvider';
import { GetAccessTokenRepository } from '../../../../core/driver/repository/xubio/auth/GetAccessTokenRepository';
import { CreateInvoiceRepository } from '../../../../core/driver/repository/xubio/facturas/CreateInvoiceRepository';
import { DeleteInvoiceRepository } from '../../../../core/driver/repository/xubio/facturas/DeleteInvoiceRepository';
import {
  readNumberConfig,
  readOptionalConfig,
  readRequiredConfig,
} from '../../shared/config/read-config';
import { readXubioRetryOptions } from './xubio-cliente-repository.factory';

export function createXubioCreateInvoiceRepository(
  configService: ConfigService,
): CreateInvoiceRepository {
  const xubioBaseUrl = readOptionalConfig(configService, 'XUBIO_BASE_URL');
  const retryOptions = readXubioRetryOptions(configService);
  const tokenProvider = createXubioAccessTokenProvider(configService);

  return new CreateInvoiceRepository({
    baseUrl: xubioBaseUrl,
    accessTokenProvider: () => tokenProvider.getAccessToken(),
    onAuthorizationFailure: () => tokenProvider.invalidateAccessToken(),
    timeoutInMilliseconds: readNumberConfig(
      configService,
      'XUBIO_INVOICE_TIMEOUT_MS',
      30_000,
    ),
    retryOptions,
  });
}

export function createXubioDeleteInvoiceRepository(
  configService: ConfigService,
): DeleteInvoiceRepository {
  const xubioBaseUrl = readOptionalConfig(configService, 'XUBIO_BASE_URL');
  const retryOptions = readXubioRetryOptions(configService);
  const tokenProvider = createXubioAccessTokenProvider(configService);

  return new DeleteInvoiceRepository({
    baseUrl: xubioBaseUrl,
    accessTokenProvider: () => tokenProvider.getAccessToken(),
    onAuthorizationFailure: () => tokenProvider.invalidateAccessToken(),
    timeoutInMilliseconds: readNumberConfig(
      configService,
      'XUBIO_INVOICE_TIMEOUT_MS',
      30_000,
    ),
    retryOptions,
  });
}

function createXubioAccessTokenProvider(
  configService: ConfigService,
): CachedXubioAccessTokenProvider {
  return new CachedXubioAccessTokenProvider(
    new GetAccessTokenRepository({
      baseUrl: readOptionalConfig(configService, 'XUBIO_BASE_URL'),
      basicAuthorizationToken: readRequiredConfig(
        configService,
        'XUBIO_BASIC_AUTHORIZATION',
      ),
      retryOptions: readXubioRetryOptions(configService),
    }),
  );
}
