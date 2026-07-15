import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetDetailsSkuRepository } from '../../../../core/driver/repository/catalog-sync-api/GetDetailsSku/GetDetailsSkuRepository';
import { GetFlokzuTlqvOrderDetailsRepository } from '../../../../core/driver/repository/flokzu/order-details/GetTlqvOrderDetailsRepository';
import { GetOpsApiTlqvOrderDetailsRepository } from '../../../../core/driver/repository/ops-api/order-details/GetTlqvOrderDetailsRepository';
import { GenerateTlqvInvoiceDocumentsInteractor } from '../../../../core/interactors/tlqv/GenerateTlqvInvoiceDocumentsInteractor';
import {
  readNumberConfig,
  readOptionalConfig,
} from '../../shared/config/read-config';
import { createMadreXubioComprobantesRepository } from '../../shared/madre/madre-repositories.factory';

export const GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR = Symbol(
  'GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR',
);

export const tlqvInvoiceDocumentsProviders: Provider[] = [
  {
    provide: GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      new GenerateTlqvInvoiceDocumentsInteractor(
        createMadreXubioComprobantesRepository(configService),
        [
          new GetOpsApiTlqvOrderDetailsRepository({
            baseUrl: readOptionalConfig(configService, 'OPS_API_BASE_URL'),
            timeoutInMilliseconds: readNumberConfig(
              configService,
              'OPS_API_TIMEOUT_MS',
              20_000,
            ),
          }),
          new GetFlokzuTlqvOrderDetailsRepository({
            baseUrl: readOptionalConfig(configService, 'FLOKZU_BASE_URL'),
            apiKey: readOptionalConfig(configService, 'FLOKZU_API_KEY'),
            username: readOptionalConfig(configService, 'FLOKZU_USERNAME'),
          }),
        ],
        new GetDetailsSkuRepository({
          baseUrl: readOptionalConfig(
            configService,
            'CATALOG_SYNC_API_BASE_URL',
          ),
          timeoutInMilliseconds: readNumberConfig(
            configService,
            'CATALOG_SYNC_API_TIMEOUT_MS',
            20_000,
          ),
        }),
      ),
  },
];
