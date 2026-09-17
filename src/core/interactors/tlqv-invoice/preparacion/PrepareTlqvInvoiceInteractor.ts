import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { MadreXubioComprobanteTlqvLookupItem } from '../../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';

export type PrepareTlqvInvoiceStatus = 'READY' | 'BLOCKED';

export type PrepareTlqvInvoiceBlockerCode =
  'BILLING_VALIDATION_UNAVAILABLE' | 'ALREADY_BILLED';

export interface PrepareTlqvInvoiceCommand {
  tlqvCode: string;
}

export interface PrepareTlqvInvoiceBlocker {
  code: PrepareTlqvInvoiceBlockerCode;
  message: string;
}

export interface PrepareTlqvInvoiceResponse {
  status: PrepareTlqvInvoiceStatus;
  canContinue: boolean;
  tlqvCode: string;
  isBilled: boolean;
  billingValidationAvailable: boolean;
  billingValidationErrorMessage?: string;
  blockers: PrepareTlqvInvoiceBlocker[];
  billedComprobantes: MadreXubioComprobanteTlqvLookupItem[];
}

export class PrepareTlqvInvoiceInteractor {
  constructor(
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
  ) {}

  async execute(
    command: PrepareTlqvInvoiceCommand,
  ): Promise<PrepareTlqvInvoiceResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);
    const billingLookup = await this.checkBilledValidation(tlqvCode);
    const billingValidationAvailable = billingLookup.status === 'found';
    const isBilled =
      billingLookup.status === 'found' ? billingLookup.exists : false;
    const blockers = buildBlockers({
      billingValidationAvailable,
      billingValidationErrorMessage:
        billingLookup.status === 'unavailable'
          ? billingLookup.errorMessage
          : undefined,
      isBilled,
      tlqvCode,
    });

    return {
      status: blockers.length === 0 ? 'READY' : 'BLOCKED',
      canContinue: blockers.length === 0,
      tlqvCode,
      isBilled,
      billingValidationAvailable,
      billingValidationErrorMessage:
        billingLookup.status === 'unavailable'
          ? billingLookup.errorMessage
          : undefined,
      blockers,
      billedComprobantes: [],
    };
  }

  private async checkBilledValidation(tlqvCode: string): Promise<
    | {
        status: 'found';
        exists: boolean;
      }
    | {
        status: 'unavailable';
        errorMessage: string;
      }
  > {
    try {
      const response =
        await this.madreXubioComprobantesRepository.existsByTlqvCode({
          tlqvCode,
        });

      if (!response.exists) {
        return { status: 'found', exists: false };
      }

      // There are comprobantes, but a factura that was already cancelled with
      // a nota de crédito must not keep the TLQV blocked — otherwise a wrongly
      // issued invoice can be voided but never reissued.
      return await this.checkHasLiveInvoice(tlqvCode);
    } catch (error: unknown) {
      return {
        status: 'unavailable',
        errorMessage: readErrorMessage(error),
      };
    }
  }

  /**
   * A factura counts as live until a nota de crédito points at it. Each nota
   * de crédito carries the transacción id of the factura it cancels in its
   * payload ("comprobante"), which is how the two are paired here.
   *
   * Fails closed on purpose: if the comprobantes cannot be read, or a nota de
   * crédito does not say which factura it cancels, the TLQV is reported as
   * billed. Leaving a TLQV blocked costs a manual review; letting one through
   * costs a duplicate invoice with a CAE.
   */
  private async checkHasLiveInvoice(
    tlqvCode: string,
  ): Promise<{ status: 'found'; exists: boolean }> {
    const full = await this.madreXubioComprobantesRepository.findFullByTlqvCode(
      { tlqvCode },
    );
    const items = full.items;

    const facturas = items.filter((item) => !isCreditNote(item));
    if (facturas.length === 0) {
      return { status: 'found', exists: false };
    }

    const creditNotes = items.filter((item) => isCreditNote(item));
    const cancelledIds = new Set<number>();
    for (const creditNote of creditNotes) {
      const cancelledId = readCancelledTransactionId(creditNote);
      if (cancelledId === null) {
        // Cannot tell what this nota de crédito cancels — stay blocked.
        return { status: 'found', exists: true };
      }
      cancelledIds.add(cancelledId);
    }

    return {
      status: 'found',
      exists: facturas.some(
        (factura) => !cancelledIds.has(factura.xubioTransactionId),
      ),
    };
  }
}

function isCreditNote(item: { documentKind?: string | null }): boolean {
  return item.documentKind === 'CREDIT_NOTE';
}

function readCancelledTransactionId(item: {
  rawDetailPayload?: unknown;
}): number | null {
  const payload = item.rawDetailPayload;
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).comprobante;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function buildBlockers(command: {
  billingValidationAvailable: boolean;
  billingValidationErrorMessage?: string;
  isBilled: boolean;
  tlqvCode: string;
}): PrepareTlqvInvoiceBlocker[] {
  const blockers: PrepareTlqvInvoiceBlocker[] = [];

  if (!command.billingValidationAvailable) {
    blockers.push({
      code: 'BILLING_VALIDATION_UNAVAILABLE',
      message: `${command.tlqvCode} billing status could not be validated against Madre.${command.billingValidationErrorMessage === undefined ? '' : ` ${command.billingValidationErrorMessage}`}`,
    });
  }

  if (command.isBilled) {
    blockers.push({
      code: 'ALREADY_BILLED',
      message: `${command.tlqvCode} already has an invoice comprobante in Madre.`,
    });
  }

  return blockers;
}

function normalizeRequiredTlqvCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === '') {
    throw new RangeError('tlqvCode is required');
  }

  const match = normalized.match(/TLQV-\d+/);
  return match?.[0] ?? normalized;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'Unknown error';
}
