import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetMadreItemByTlqvCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/madre/GetMadreItemByTlqvCodeRepository';
import { GetTlqvItemByCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/tlqv/GetTlqvItemByCodeRepository';
import {
  CreateTlqvInvoiceFlowInteractor,
  type ICreateXubioClienteFromTlqvUseCase,
} from '../../../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import { DeleteXubioInvoiceInteractor } from '../../../../core/interactors/xubio/facturas/DeleteXubioInvoiceInteractor';
import {
  readNumberConfig,
  readOptionalConfig,
} from '../../shared/config/read-config';
import {
  createXubioCreateInvoiceRepository,
  createXubioDeleteInvoiceRepository,
} from '../../xubio/shared/xubio-factura-repository.factory';
import { CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR } from '../clientes/tlqv-invoice-clientes.providers';

export const CREATE_TLQV_INVOICE_FLOW_INTERACTOR = Symbol(
  'CREATE_TLQV_INVOICE_FLOW_INTERACTOR',
);
export const DELETE_XUBIO_INVOICE_INTERACTOR = Symbol(
  'DELETE_XUBIO_INVOICE_INTERACTOR',
);

export const tlqvInvoiceFacturasInteractorProviders: Provider[] = [
  {
    provide: CREATE_TLQV_INVOICE_FLOW_INTERACTOR,
    inject: [CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR, ConfigService],
    useFactory: (
      createXubioClienteFromTlqvUseCase: ICreateXubioClienteFromTlqvUseCase,
      configService: ConfigService,
    ) => {
      const spreadsheetOptions = {
        baseUrl: readOptionalConfig(configService, 'SPREADSHEET_API_BASE_URL'),
        spreadsheetName: readOptionalConfig(
          configService,
          'SPREADSHEET_API_INVOICE_SPREADSHEET_NAME',
        ),
        timeoutInMilliseconds: readNumberConfig(
          configService,
          'SPREADSHEET_API_TIMEOUT_MS',
          10_000,
        ),
      };

      return new CreateTlqvInvoiceFlowInteractor(
        createXubioClienteFromTlqvUseCase,
        new GetTlqvItemByCodeRepository(spreadsheetOptions),
        new GetMadreItemByTlqvCodeRepository(spreadsheetOptions),
        createXubioCreateInvoiceRepository(configService),
      );
    },
  },
  {
    provide: DELETE_XUBIO_INVOICE_INTERACTOR,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      new DeleteXubioInvoiceInteractor(
        createXubioDeleteInvoiceRepository(configService),
      ),
  },
];
