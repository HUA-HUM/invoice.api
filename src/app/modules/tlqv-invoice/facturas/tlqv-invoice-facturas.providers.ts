import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetCostosOperacionesByTlqvCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/costos-operaciones/GetCostosOperacionesByTlqvCodeRepository';
import { GetMadreItemByTlqvCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/madre/GetMadreItemByTlqvCodeRepository';
import { GetStockBueItemByTlqvCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/stock-bue/GetStockBueItemByTlqvCodeRepository';
import { GetTlqvItemByCodeRepository } from '../../../../core/driver/repository/spreadsheet-api/tlqv/GetTlqvItemByCodeRepository';
import {
  CreateTlqvInvoiceFlowInteractor,
  type ICreateXubioClienteFromTlqvUseCase,
} from '../../../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import { CreateNotaCreditoFromTlqvInteractor } from '../../../../core/interactors/tlqv-invoice/facturas/CreateNotaCreditoFromTlqvInteractor';
import { DeleteXubioInvoiceInteractor } from '../../../../core/interactors/xubio/facturas/DeleteXubioInvoiceInteractor';
import { createMadreXubioComprobantesRepository } from '../../shared/madre/madre-repositories.factory';
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
export const CREATE_NOTA_CREDITO_FROM_TLQV_INTERACTOR = Symbol(
  'CREATE_NOTA_CREDITO_FROM_TLQV_INTERACTOR',
);

export const tlqvInvoiceFacturasInteractorProviders: Provider[] = [
  {
    provide: CREATE_TLQV_INVOICE_FLOW_INTERACTOR,
    inject: [CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR, ConfigService],
    useFactory: (
      createXubioClienteFromTlqvUseCase: ICreateXubioClienteFromTlqvUseCase,
      configService: ConfigService,
    ) => {
      // The Spreadsheet API reads a live Google Sheet and times out every so
      // often. Each call is a plain read of one row, so retrying costs nothing
      // and it is what lets a single TLQV be invoiced from the panel: before
      // this, only the bulk queue recovered, by retrying the whole job.
      const spreadsheetRetryOptions = {
        maxAttempts: readNumberConfig(
          configService,
          'SPREADSHEET_API_RETRY_ATTEMPTS',
          3,
        ),
        initialDelayInMilliseconds: readNumberConfig(
          configService,
          'SPREADSHEET_API_RETRY_INITIAL_DELAY_MS',
          500,
        ),
      };
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
        retryOptions: spreadsheetRetryOptions,
      };

      return new CreateTlqvInvoiceFlowInteractor(
        createXubioClienteFromTlqvUseCase,
        new GetTlqvItemByCodeRepository(spreadsheetOptions),
        new GetMadreItemByTlqvCodeRepository(spreadsheetOptions),
        createXubioCreateInvoiceRepository(configService),
        undefined,
        undefined,
        new GetTlqvItemByCodeRepository({
          ...spreadsheetOptions,
          spreadsheetName: 'prueba-lectura',
        }),
        new GetStockBueItemByTlqvCodeRepository({
          baseUrl: readOptionalConfig(
            configService,
            'SPREADSHEET_API_BASE_URL',
          ),
          timeoutInMilliseconds: readNumberConfig(
            configService,
            'SPREADSHEET_API_TIMEOUT_MS',
            10_000,
          ),
          retryOptions: spreadsheetRetryOptions,
        }),
        new GetCostosOperacionesByTlqvCodeRepository({
          baseUrl: readOptionalConfig(
            configService,
            'SPREADSHEET_API_BASE_URL',
          ),
          timeoutInMilliseconds: readNumberConfig(
            configService,
            'SPREADSHEET_API_TIMEOUT_MS',
            10_000,
          ),
          retryOptions: spreadsheetRetryOptions,
        }),
      );
    },
  },
  {
    provide: CREATE_NOTA_CREDITO_FROM_TLQV_INTERACTOR,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      new CreateNotaCreditoFromTlqvInteractor(
        createMadreXubioComprobantesRepository(configService),
        createXubioCreateInvoiceRepository(configService),
      ),
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
