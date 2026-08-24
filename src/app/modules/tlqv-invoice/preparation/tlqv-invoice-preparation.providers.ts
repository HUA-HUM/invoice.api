import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MadreXubioComprobantesRepository } from '../../../../core/driver/repository/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import { PrepareTlqvInvoiceInteractor } from '../../../../core/interactors/tlqv-invoice/preparacion/PrepareTlqvInvoiceInteractor';
import {
  readNumberConfig,
  readRequiredConfig,
} from '../../shared/config/read-config';

export const PREPARE_TLQV_INVOICE_INTERACTOR = Symbol(
  'PREPARE_TLQV_INVOICE_INTERACTOR',
);

export const prepareTlqvInvoiceInteractorProvider: Provider = {
  provide: PREPARE_TLQV_INVOICE_INTERACTOR,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) =>
    new PrepareTlqvInvoiceInteractor(
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
    ),
};
