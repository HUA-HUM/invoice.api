import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IInvoiceClientIssueRepository } from '../../core/adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import {
  INVOICE_CLIENT_ISSUE_REASONS,
  type InvoiceClientIssueReason,
} from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
import type {
  CreateTlqvInvoiceFlowResponse,
  TlqvInvoiceFlowBlocker,
} from '../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import { readErrorMessage } from '../drivers/queue/wait-until-queue-ready';
import { INVOICE_CLIENT_ISSUES_REPOSITORY } from '../modules/tlqv-invoice/issues/tlqv-invoice-issues.providers';

export interface RecordBlockedInvoiceIssueCommand {
  tlqvCode: string;
  response: CreateTlqvInvoiceFlowResponse;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface RecordUnhandledInvoiceFailureCommand {
  tlqvCode: string;
  error: unknown;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists why a TLQV could not be invoiced (blocked flow or unhandled
 * exception) as an InvoiceClientIssue in Madre, so it can be listed and
 * diagnosed later via GET /internal/tlqv-invoice/issues. Shared between the
 * single create-from-tlqv endpoint and the bulk queue worker so neither path
 * silently drops that information.
 */
@Injectable()
export class InvoiceClientIssueRecorderService {
  private readonly logger = new Logger(InvoiceClientIssueRecorderService.name);

  constructor(
    @Inject(INVOICE_CLIENT_ISSUES_REPOSITORY)
    private readonly invoiceClientIssueRepository: IInvoiceClientIssueRepository,
  ) {}

  async recordBlocked(
    command: RecordBlockedInvoiceIssueCommand,
  ): Promise<void> {
    if (command.response.status !== 'blocked') {
      return;
    }

    const blockers = command.response.blockers;
    const reason = resolveInvoiceClientIssueReason(blockers);

    if (reason === 'INVALID_FISCAL_DOCUMENT') {
      return;
    }

    try {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode: command.tlqvCode,
        reason,
        source: 'invoice_api',
        saleNumber: readSaleNumber(command.response),
        buyerName: readBuyerName(command.response),
        email: readBuyerEmail(command.response),
        cuit: readBuyerDocumento(command.response),
        documentoTipo: readDocumentoTipo(command.response),
        documentoNro: readBuyerDocumento(command.response),
        documentoNroDigits: readBuyerDocumentoDigits(command.response),
        message: buildBlockedIssueMessage(blockers),
        messages: buildBlockedIssueMessages(blockers),
        rawPayload: {
          status: command.response.status,
          blockers,
        },
        metadata: {
          source: command.source,
          blockerCodes: blockers.map((blocker) => blocker.code),
          response: command.response,
          ...command.metadata,
        },
        now: new Date(),
      });
    } catch (error: unknown) {
      this.logger.error(
        `Invoice client issue registration failed ${JSON.stringify({
          tlqvCode: command.tlqvCode,
          source: command.source,
          reason,
          errorMessage: readErrorMessage(error),
        })}`,
      );
    }
  }

  async recordUnhandledFailure(
    command: RecordUnhandledInvoiceFailureCommand,
  ): Promise<void> {
    try {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode: command.tlqvCode,
        reason: 'TLQV_INVOICE_JOB_FAILED',
        source: 'invoice_api',
        message: `Falló la facturación de ${command.tlqvCode}. ${readErrorMessage(command.error)}`,
        messages: [readErrorMessage(command.error)],
        rawPayload: {
          errorMessage: readErrorMessage(command.error),
        },
        metadata: {
          source: command.source,
          ...command.metadata,
        },
        now: new Date(),
      });
    } catch (error: unknown) {
      this.logger.error(
        `Invoice client issue failure registration failed ${JSON.stringify({
          tlqvCode: command.tlqvCode,
          source: command.source,
          errorMessage: readErrorMessage(error),
        })}`,
      );
    }
  }
}

function resolveInvoiceClientIssueReason(
  blockers: TlqvInvoiceFlowBlocker[],
): InvoiceClientIssueReason {
  for (const blocker of blockers) {
    if (isInvoiceClientIssueReason(blocker.code)) {
      return blocker.code;
    }
  }

  return 'TLQV_INVOICE_FLOW_BLOCKED';
}

function isInvoiceClientIssueReason(
  value: string,
): value is InvoiceClientIssueReason {
  return INVOICE_CLIENT_ISSUE_REASONS.includes(
    value as InvoiceClientIssueReason,
  );
}

function buildBlockedIssueMessage(blockers: TlqvInvoiceFlowBlocker[]): string {
  const firstBlocker = blockers[0];

  if (firstBlocker === undefined) {
    return 'El flujo de facturación quedó bloqueado sin blocker informado.';
  }

  return `${firstBlocker.step} | ${firstBlocker.code}: ${firstBlocker.message}`;
}

function buildBlockedIssueMessages(
  blockers: TlqvInvoiceFlowBlocker[],
): string[] {
  if (blockers.length === 0) {
    return ['El flujo de facturación quedó bloqueado.'];
  }

  return blockers.map(
    (blocker) => `${blocker.step} | ${blocker.code}: ${blocker.message}`,
  );
}

function readSaleNumber(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return response.clienteFlow?.orderDetails?.saleNumber ?? null;
}

function readBuyerName(response: CreateTlqvInvoiceFlowResponse): string | null {
  return response.clienteFlow?.buyerData?.nombreDestinatario ?? null;
}

function readBuyerEmail(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return response.clienteFlow?.buyerData?.email ?? null;
}

function readBuyerDocumento(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return (
    readClienteFlowFiscalInfo(response)?.documentoNro ??
    response.clienteFlow?.buyerData?.cuitComprador ??
    null
  );
}

function readBuyerDocumentoDigits(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return (
    readClienteFlowFiscalInfo(response)?.documentoNroDigits ??
    response.clienteFlow?.buyerData?.cuitCompradorDigits ??
    null
  );
}

function readDocumentoTipo(
  response: CreateTlqvInvoiceFlowResponse,
): string | null {
  return response.clienteFlow?.documentoTipo ?? null;
}

function readClienteFlowFiscalInfo(
  response: CreateTlqvInvoiceFlowResponse,
): { documentoNro?: string | null; documentoNroDigits?: string | null } | null {
  const clienteFlow = response.clienteFlow;

  if (clienteFlow === undefined || !clienteFlow.canContinue) {
    return null;
  }

  return clienteFlow.fiscalInfo;
}
