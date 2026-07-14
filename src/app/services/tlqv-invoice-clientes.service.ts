import { Inject, Injectable } from '@nestjs/common';
import {
  CreateXubioConsumidorFinalClienteFromIssueInteractor,
  type CreateXubioConsumidorFinalClienteFromIssueCommand,
  type CreateXubioConsumidorFinalClienteFromIssueResponse,
} from '../../core/interactors/tlqv/CreateXubioConsumidorFinalClienteFromIssueInteractor';
import {
  CreateXubioClienteFromTlqvInteractor,
  type CreateXubioClienteFromTlqvCommand,
  type CreateXubioClienteFromTlqvResponse,
} from '../../core/interactors/tlqv/CreateXubioClienteFromTlqvInteractor';
import {
  CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR,
  CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR,
} from '../modules/tlqv-invoice/clientes/tlqv-invoice-clientes.providers';

@Injectable()
export class TlqvInvoiceClientesService {
  constructor(
    @Inject(CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR)
    private readonly createXubioClienteFromTlqvInteractor: CreateXubioClienteFromTlqvInteractor,
    @Inject(CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR)
    private readonly createXubioConsumidorFinalClienteFromIssueInteractor: CreateXubioConsumidorFinalClienteFromIssueInteractor,
  ) {}

  execute(
    command: CreateXubioClienteFromTlqvCommand,
  ): Promise<CreateXubioClienteFromTlqvResponse> {
    return this.createXubioClienteFromTlqvInteractor.execute(command);
  }

  createConsumidorFinalFromIssue(
    command: CreateXubioConsumidorFinalClienteFromIssueCommand,
  ): Promise<CreateXubioConsumidorFinalClienteFromIssueResponse> {
    return this.createXubioConsumidorFinalClienteFromIssueInteractor.execute(
      command,
    );
  }
}
