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

      return {
        status: 'found',
        exists: response.exists,
      };
    } catch (error: unknown) {
      return {
        status: 'unavailable',
        errorMessage: readErrorMessage(error),
      };
    }
  }
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
