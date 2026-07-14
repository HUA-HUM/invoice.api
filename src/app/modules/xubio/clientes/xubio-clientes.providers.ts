import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateXubioClienteInteractor } from '../../../../core/interactors/xubio/clientes/CreateXubioClienteInteractor';
import { createMadreInvoiceClientIssuesRepository } from '../../shared/madre/madre-repositories.factory';
import { createXubioCreateClienteRepository } from '../shared/xubio-cliente-repository.factory';

export const CREATE_XUBIO_CLIENTE_INTERACTOR = Symbol(
  'CREATE_XUBIO_CLIENTE_INTERACTOR',
);

export const createXubioClienteInteractorProvider: Provider = {
  provide: CREATE_XUBIO_CLIENTE_INTERACTOR,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) =>
    new CreateXubioClienteInteractor(
      createXubioCreateClienteRepository(configService),
      createMadreInvoiceClientIssuesRepository(configService),
    ),
};
