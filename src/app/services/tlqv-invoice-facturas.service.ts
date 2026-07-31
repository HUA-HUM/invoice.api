import { Inject, Injectable } from '@nestjs/common';
import {
  CreateTlqvInvoiceFlowInteractor,
  type CreateTlqvInvoiceFlowCommand,
  type CreateTlqvInvoiceFlowResponse,
} from '../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import {
  DeleteXubioInvoiceInteractor,
} from '../../core/interactors/xubio/facturas/DeleteXubioInvoiceInteractor';
import type {
  DeleteXubioInvoiceCommand,
  DeleteXubioInvoiceResponse,
} from '../../core/entities/xubio/facturas/XubioInvoice';
import {
  CREATE_TLQV_INVOICE_FLOW_INTERACTOR,
  DELETE_XUBIO_INVOICE_INTERACTOR,
} from '../modules/tlqv-invoice/facturas/tlqv-invoice-facturas.providers';

@Injectable()
export class TlqvInvoiceFacturasService {
  constructor(
    @Inject(CREATE_TLQV_INVOICE_FLOW_INTERACTOR)
    private readonly createTlqvInvoiceFlowInteractor: CreateTlqvInvoiceFlowInteractor,
    @Inject(DELETE_XUBIO_INVOICE_INTERACTOR)
    private readonly deleteXubioInvoiceInteractor: DeleteXubioInvoiceInteractor,
  ) {}

  createFromTlqv(
    command: CreateTlqvInvoiceFlowCommand,
  ): Promise<CreateTlqvInvoiceFlowResponse> {
    return this.createTlqvInvoiceFlowInteractor.execute(command);
  }

  deleteByTransaccionId(
    command: DeleteXubioInvoiceCommand,
  ): Promise<DeleteXubioInvoiceResponse> {
    return this.deleteXubioInvoiceInteractor.execute(command);
  }
}
