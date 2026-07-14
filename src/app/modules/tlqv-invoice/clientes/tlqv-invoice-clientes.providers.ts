import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetFlokzuTlqvOrderDetailsRepository } from '../../../../core/driver/repository/flokzu/order-details/GetTlqvOrderDetailsRepository';
import { GetOpsApiTlqvOrderDetailsRepository } from '../../../../core/driver/repository/ops-api/order-details/GetTlqvOrderDetailsRepository';
import { GetTusFacturasAfipInfoRepository } from '../../../../core/driver/repository/tus-facturas/afip-info/GetTusFacturasAfipInfoRepository';
import { CreateXubioConsumidorFinalClienteFromIssueInteractor } from '../../../../core/interactors/tlqv/CreateXubioConsumidorFinalClienteFromIssueInteractor';
import { CreateXubioClienteFromTlqvInteractor } from '../../../../core/interactors/tlqv/CreateXubioClienteFromTlqvInteractor';
import { StockBueTlqvCacheManagerRepository } from '../../../drivers/cache/stock-bue/stock-bue-tlqv-cache-manager.repository';
import {
  readNumberConfig,
  readOptionalConfig,
  readRequiredConfig,
} from '../../shared/config/read-config';
import {
  createMadreInvoiceClientIssuesRepository,
  createMadreXubioComprobantesRepository,
} from '../../shared/madre/madre-repositories.factory';
import { createXubioCreateClienteRepository } from '../../xubio/shared/xubio-cliente-repository.factory';

export const CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR = Symbol(
  'CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR',
);
export const CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR =
  Symbol('CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR');

export const tlqvInvoiceClientesInteractorProviders: Provider[] = [
  {
    provide: CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR,
    inject: [ConfigService, StockBueTlqvCacheManagerRepository],
    useFactory: (
      configService: ConfigService,
      stockBueTlqvCacheRepository: StockBueTlqvCacheManagerRepository,
    ) =>
      new CreateXubioClienteFromTlqvInteractor(
        stockBueTlqvCacheRepository,
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
        new GetTusFacturasAfipInfoRepository({
          baseUrl: readOptionalConfig(configService, 'TUS_FACTURAS_BASE_URL'),
          userToken: readRequiredConfig(
            configService,
            'TUS_FACTURAS_USER_TOKEN',
          ),
          apiKey: readRequiredConfig(configService, 'TUS_FACTURAS_API_KEY'),
          apiToken: readRequiredConfig(configService, 'TUS_FACTURAS_API_TOKEN'),
          cookie: readOptionalConfig(configService, 'TUS_FACTURAS_COOKIE'),
        }),
        createXubioCreateClienteRepository(configService),
        createMadreInvoiceClientIssuesRepository(configService),
        () => new Date(),
      ),
  },
  {
    provide: CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      new CreateXubioConsumidorFinalClienteFromIssueInteractor(
        createMadreInvoiceClientIssuesRepository(configService),
        createXubioCreateClienteRepository(configService),
        () => new Date(),
      ),
  },
];
