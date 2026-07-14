import { Inject, Injectable } from '@nestjs/common';
import {
  PrepareTlqvInvoiceInteractor,
  type PrepareTlqvInvoiceCommand,
  type PrepareTlqvInvoiceResponse,
} from '../../core/interactors/tlqv/PrepareTlqvInvoiceInteractor';
import { PREPARE_TLQV_INVOICE_INTERACTOR } from '../modules/tlqv-invoice/preparation/tlqv-invoice-preparation.providers';

@Injectable()
export class TlqvInvoicePreparationService {
  constructor(
    @Inject(PREPARE_TLQV_INVOICE_INTERACTOR)
    private readonly interactor: PrepareTlqvInvoiceInteractor,
  ) {}

  execute(
    command: PrepareTlqvInvoiceCommand,
  ): Promise<PrepareTlqvInvoiceResponse> {
    return this.interactor.execute(command);
  }
}
