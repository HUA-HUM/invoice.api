import { Inject, Injectable } from '@nestjs/common';
import {
  CreateTlqvInvoiceFlowInteractor,
  type CreateTlqvInvoiceFlowCommand,
  type CreateTlqvInvoiceFlowResponse,
} from '../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import {
  CreateNotaCreditoFromTlqvInteractor,
  type CreateNotaCreditoFromTlqvCommand,
  type CreateNotaCreditoFromTlqvResponse,
} from '../../core/interactors/tlqv-invoice/facturas/CreateNotaCreditoFromTlqvInteractor';
import { DeleteXubioInvoiceInteractor } from '../../core/interactors/xubio/facturas/DeleteXubioInvoiceInteractor';
import type {
  DeleteXubioInvoiceCommand,
  DeleteXubioInvoiceResponse,
} from '../../core/entities/xubio/facturas/XubioInvoice';
import {
  CREATE_NOTA_CREDITO_FROM_TLQV_INTERACTOR,
  CREATE_TLQV_INVOICE_FLOW_INTERACTOR,
  DELETE_XUBIO_INVOICE_INTERACTOR,
} from '../modules/tlqv-invoice/facturas/tlqv-invoice-facturas.providers';
import { InvoiceClientIssueRecorderService } from './invoice-client-issue-recorder.service';

const ISSUE_SOURCE = 'tlqv_invoice_facturas_single';

@Injectable()
export class TlqvInvoiceFacturasService {
  constructor(
    @Inject(CREATE_TLQV_INVOICE_FLOW_INTERACTOR)
    private readonly createTlqvInvoiceFlowInteractor: CreateTlqvInvoiceFlowInteractor,
    @Inject(DELETE_XUBIO_INVOICE_INTERACTOR)
    private readonly deleteXubioInvoiceInteractor: DeleteXubioInvoiceInteractor,
    @Inject(CREATE_NOTA_CREDITO_FROM_TLQV_INTERACTOR)
    private readonly createNotaCreditoFromTlqvInteractor: CreateNotaCreditoFromTlqvInteractor,
    private readonly invoiceClientIssueRecorder: InvoiceClientIssueRecorderService,
  ) {}

  async createFromTlqv(
    command: CreateTlqvInvoiceFlowCommand,
  ): Promise<CreateTlqvInvoiceFlowResponse> {
    try {
      const response =
        await this.createTlqvInvoiceFlowInteractor.execute(command);

      if (response.status === 'blocked') {
        await this.invoiceClientIssueRecorder.recordBlocked({
          tlqvCode: command.tlqvCode,
          response,
          source: ISSUE_SOURCE,
          metadata: {
            dryRun: command.dryRun,
            issueDate: command.issueDate,
            stopAfter: command.stopAfter,
          },
        });
      }

      return response;
    } catch (error: unknown) {
      await this.invoiceClientIssueRecorder.recordUnhandledFailure({
        tlqvCode: command.tlqvCode,
        error,
        source: ISSUE_SOURCE,
        metadata: {
          dryRun: command.dryRun,
          issueDate: command.issueDate,
          stopAfter: command.stopAfter,
        },
      });

      throw error;
    }
  }

  createNotaCreditoFromTlqv(
    command: CreateNotaCreditoFromTlqvCommand,
  ): Promise<CreateNotaCreditoFromTlqvResponse> {
    return this.createNotaCreditoFromTlqvInteractor.execute(command);
  }

  deleteByTransaccionId(
    command: DeleteXubioInvoiceCommand,
  ): Promise<DeleteXubioInvoiceResponse> {
    return this.deleteXubioInvoiceInteractor.execute(command);
  }
}
