import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MadreXubioComprobantesRepository } from '../../../../core/driver/repository/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import { GetStockBueItemByTlqvCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/stock-bue/GetStockBueItemByTlqvCodeRepository';
import { PrepareTlqvInvoiceInteractor } from '../../../../core/interactors/tlqv-invoice/preparacion/PrepareTlqvInvoiceInteractor';
import { StockBueTlqvCacheManagerRepository } from '../../../drivers/cache/stock-bue/stock-bue-tlqv-cache-manager.repository';
import {
  readNumberConfig,
  readOptionalConfig,
  readRequiredConfig,
} from '../../shared/config/read-config';

export const PREPARE_TLQV_INVOICE_INTERACTOR = Symbol(
  'PREPARE_TLQV_INVOICE_INTERACTOR',
);

export const prepareTlqvInvoiceInteractorProvider: Provider = {
  provide: PREPARE_TLQV_INVOICE_INTERACTOR,
  inject: [ConfigService, StockBueTlqvCacheManagerRepository],
  useFactory: (
    configService: ConfigService,
    stockBueTlqvCacheRepository: StockBueTlqvCacheManagerRepository,
  ) =>
    new PrepareTlqvInvoiceInteractor(
      stockBueTlqvCacheRepository,
      new MadreXubioComprobantesRepository({
        baseUrl: readRequiredConfig(configService, 'MADRE_API_BASE_URL'),
        internalApiKey: readRequiredConfig(
          configService,
          'MADRE_INTERNAL_API_KEY',
        ),
        timeoutInMilliseconds: readNumberConfig(
          configService,
          'MADRE_API_TIMEOUT_MS',
          20_000,
        ),
      }),
      new GetStockBueItemByTlqvCodeRepository({
        baseUrl: readOptionalConfig(configService, 'SPREADSHEET_API_BASE_URL'),
        timeoutInMilliseconds: readNumberConfig(
          configService,
          'SPREADSHEET_API_TIMEOUT_MS',
          10_000,
        ),
      }),
    ),
};
