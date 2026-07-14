import { ConfigService } from '@nestjs/config';
import { MadreInvoiceClientIssuesRepository } from '../../../../core/driver/repository/madre-api/invoice/client-issues/MadreInvoiceClientIssuesRepository';
import { MadreXubioComprobantesRepository } from '../../../../core/driver/repository/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import { readNumberConfig, readRequiredConfig } from '../config/read-config';

export function createMadreXubioComprobantesRepository(
  configService: ConfigService,
): MadreXubioComprobantesRepository {
  return new MadreXubioComprobantesRepository({
    baseUrl: readRequiredConfig(configService, 'MADRE_API_BASE_URL'),
    internalApiKey: readRequiredConfig(configService, 'MADRE_INTERNAL_API_KEY'),
    timeoutInMilliseconds: readNumberConfig(
      configService,
      'MADRE_API_TIMEOUT_MS',
      20_000,
    ),
  });
}

export function createMadreInvoiceClientIssuesRepository(
  configService: ConfigService,
): MadreInvoiceClientIssuesRepository {
  return new MadreInvoiceClientIssuesRepository({
    baseUrl: readRequiredConfig(configService, 'MADRE_API_BASE_URL'),
    internalApiKey: readRequiredConfig(configService, 'MADRE_INTERNAL_API_KEY'),
    timeoutInMilliseconds: readNumberConfig(
      configService,
      'MADRE_API_TIMEOUT_MS',
      20_000,
    ),
  });
}
