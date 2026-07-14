import { Inject, Injectable } from '@nestjs/common';
import type { CreateXubioClienteFromFiscalInfoCommand } from '../../core/entities/xubio/clientes/XubioCliente';
import type { CreateXubioClienteFromFiscalInfoResponse } from '../../core/entities/xubio/clientes/XubioCliente';
import { CreateXubioClienteInteractor } from '../../core/interactors/xubio/clientes/CreateXubioClienteInteractor';
import { CREATE_XUBIO_CLIENTE_INTERACTOR } from '../modules/xubio/clientes/xubio-clientes.providers';

@Injectable()
export class XubioClientesService {
  constructor(
    @Inject(CREATE_XUBIO_CLIENTE_INTERACTOR)
    private readonly interactor: CreateXubioClienteInteractor,
  ) {}

  execute(
    command: CreateXubioClienteFromFiscalInfoCommand,
  ): Promise<CreateXubioClienteFromFiscalInfoResponse> {
    return this.interactor.execute(command);
  }
}
