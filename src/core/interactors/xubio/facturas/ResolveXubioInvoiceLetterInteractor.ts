import type { XubioInvoiceLetter } from '../../../entities/xubio/facturas/XubioInvoice';

export type XubioInvoiceLetterMatchedRule =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTISTA'
  | 'CONSUMIDOR_FINAL'
  | 'EXENTO'
  | 'EXTERIOR'
  | 'IVA_NO_ALCANZADO'
  | 'DEFAULT_B';

export interface ResolveXubioInvoiceLetterCommand {
  condicionFiscal?: string | null;
}

export interface ResolveXubioInvoiceLetterResponse {
  letter: XubioInvoiceLetter;
  condicionFiscal: string | null;
  matchedRule: XubioInvoiceLetterMatchedRule;
}

export class ResolveXubioInvoiceLetterInteractor {
  execute(
    command: ResolveXubioInvoiceLetterCommand,
  ): ResolveXubioInvoiceLetterResponse {
    return resolveXubioInvoiceLetterFromFiscalCondition(
      command.condicionFiscal,
    );
  }
}

export function resolveXubioInvoiceLetterFromFiscalCondition(
  condicionFiscal: string | null | undefined,
): ResolveXubioInvoiceLetterResponse {
  const normalizedCondition = normalizeFiscalCondition(condicionFiscal);

  if (normalizedCondition.includes('RESPONSABLE INSCRIPTO')) {
    return buildResponse(condicionFiscal, 'A', 'RESPONSABLE_INSCRIPTO');
  }

  if (
    normalizedCondition.includes('MONOTRIBUTISTA') ||
    normalizedCondition.includes('MONOTRIBUTO')
  ) {
    return buildResponse(condicionFiscal, 'A', 'MONOTRIBUTISTA');
  }

  if (normalizedCondition.includes('CONSUMIDOR FINAL')) {
    return buildResponse(condicionFiscal, 'B', 'CONSUMIDOR_FINAL');
  }

  if (normalizedCondition.includes('EXENTO')) {
    return buildResponse(condicionFiscal, 'B', 'EXENTO');
  }

  if (
    normalizedCondition.includes('EXTERIOR') ||
    normalizedCondition.includes('EXTRANJERO')
  ) {
    return buildResponse(condicionFiscal, 'B', 'EXTERIOR');
  }

  if (
    normalizedCondition.includes('IVA NO ALCANZADO') ||
    normalizedCondition.includes('NO ALCANZADO')
  ) {
    return buildResponse(condicionFiscal, 'B', 'IVA_NO_ALCANZADO');
  }

  return buildResponse(condicionFiscal, 'B', 'DEFAULT_B');
}

function buildResponse(
  condicionFiscal: string | null | undefined,
  letter: XubioInvoiceLetter,
  matchedRule: XubioInvoiceLetterMatchedRule,
): ResolveXubioInvoiceLetterResponse {
  const trimmedCondition =
    condicionFiscal === undefined || condicionFiscal === null
      ? null
      : condicionFiscal.trim();

  return {
    letter,
    condicionFiscal:
      trimmedCondition === null || trimmedCondition === ''
        ? null
        : trimmedCondition,
    matchedRule,
  };
}

function normalizeFiscalCondition(value: string | null | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
