import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetTusFacturasAfipInfoRepository } from '../../../core/driver/repository/tus-facturas/afip-info/GetTusFacturasAfipInfoRepository';
import { GetTusFacturasAfipInfoInteractor } from '../../../core/interactors/tus-facturas/GetTusFacturasAfipInfoInteractor';
import {
  readOptionalConfig,
  readRequiredConfig,
} from '../shared/config/read-config';
import { createMadreInvoiceClientIssuesRepository } from '../shared/madre/madre-repositories.factory';

export const GET_TUS_FACTURAS_AFIP_INFO_INTERACTOR = Symbol(
  'GET_TUS_FACTURAS_AFIP_INFO_INTERACTOR',
);

export const getTusFacturasAfipInfoInteractorProvider: Provider = {
  provide: GET_TUS_FACTURAS_AFIP_INFO_INTERACTOR,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) =>
    new GetTusFacturasAfipInfoInteractor(
      new GetTusFacturasAfipInfoRepository({
        baseUrl: readOptionalConfig(configService, 'TUS_FACTURAS_BASE_URL'),
        userToken: readRequiredConfig(configService, 'TUS_FACTURAS_USER_TOKEN'),
        apiKey: readRequiredConfig(configService, 'TUS_FACTURAS_API_KEY'),
        apiToken: readRequiredConfig(configService, 'TUS_FACTURAS_API_TOKEN'),
        cookie: readOptionalConfig(configService, 'TUS_FACTURAS_COOKIE'),
      }),
      createMadreInvoiceClientIssuesRepository(configService),
    ),
};
