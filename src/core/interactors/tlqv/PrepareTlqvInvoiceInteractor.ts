import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { StockBueTlqvCacheItem } from '../../entities/cache/stock-bue/StockBueTlqvCache';
import type { MadreXubioComprobanteTlqvLookupItem } from '../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';
import {
  STOCK_BUE_DISPATCHED_INSTRUCTION,
  type StockBueItemData,
} from '../../entities/spreadsheet-api/stock-bue/StockBueItems';
import { normalizeTlqvCode } from '../stock-bue/FindUnbilledDispatchedStockBueTlqvInteractor';

export type PrepareTlqvInvoiceStatus = 'READY' | 'BLOCKED';

export type PrepareTlqvInvoiceBlockerCode =
  | 'CACHE_NOT_READY'
  | 'BILLING_VALIDATION_UNAVAILABLE'
  | 'ALREADY_BILLED'
  | 'NOT_FOUND_IN_STOCK_BUE'
  | 'NOT_DISPATCHED';

export interface PrepareTlqvInvoiceCommand {
  tlqvCode: string;
}

export interface PrepareTlqvInvoiceBlocker {
  code: PrepareTlqvInvoiceBlockerCode;
  message: string;
}

export interface PrepareTlqvInvoiceStockBueItem {
  tlqvCode: string;
  rowNumber: number;
  instruction?: string;
  saleNumber?: string;
  description?: string;
  fechaRecepcion?: string;
  fechaSalida?: string;
  fechaLimite?: string;
  fechaInstruccion?: string;
  rawData: StockBueItemData;
}

export interface PrepareTlqvInvoiceResponse {
  status: PrepareTlqvInvoiceStatus;
  canContinue: boolean;
  tlqvCode: string;
  isBilled: boolean;
  isDispatched: boolean;
  billingValidationAvailable: boolean;
  billingValidationErrorMessage?: string;
  cacheRefreshedAt?: string;
  blockers: PrepareTlqvInvoiceBlocker[];
  billedComprobantes: MadreXubioComprobanteTlqvLookupItem[];
  stockBueItem?: PrepareTlqvInvoiceStockBueItem;
}

export class PrepareTlqvInvoiceInteractor {
  constructor(
    private readonly stockBueTlqvCacheRepository: IStockBueTlqvCacheRepository,
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
  ) {}

  async execute(
    command: PrepareTlqvInvoiceCommand,
  ): Promise<PrepareTlqvInvoiceResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);
    const [cacheLookup, billingLookup] = await Promise.all([
      this.stockBueTlqvCacheRepository.getByTlqvCode(tlqvCode),
      this.checkBilledValidation(tlqvCode),
    ]);
    const billingValidationAvailable = billingLookup.status === 'found';
    const isBilled =
      billingLookup.status === 'found' ? billingLookup.exists : false;
    const stockBueItem =
      cacheLookup.item === undefined
        ? undefined
        : toStockBueItem(cacheLookup.item);
    const isDispatched =
      normalizeInstruction(stockBueItem?.instruction) ===
      STOCK_BUE_DISPATCHED_INSTRUCTION;
    const blockers = buildBlockers({
      cacheReady: cacheLookup.metadata !== undefined,
      billingValidationAvailable,
      billingValidationErrorMessage:
        billingLookup.status === 'unavailable'
          ? billingLookup.errorMessage
          : undefined,
      isBilled,
      stockBueItemFound: stockBueItem !== undefined,
      isDispatched,
      tlqvCode,
    });

    return {
      status: blockers.length === 0 ? 'READY' : 'BLOCKED',
      canContinue: blockers.length === 0,
      tlqvCode,
      isBilled,
      isDispatched,
      billingValidationAvailable,
      billingValidationErrorMessage:
        billingLookup.status === 'unavailable'
          ? billingLookup.errorMessage
          : undefined,
      cacheRefreshedAt: cacheLookup.metadata?.refreshedAt,
      blockers,
      billedComprobantes: [],
      stockBueItem,
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
  cacheReady: boolean;
  billingValidationAvailable: boolean;
  billingValidationErrorMessage?: string;
  isBilled: boolean;
  stockBueItemFound: boolean;
  isDispatched: boolean;
  tlqvCode: string;
}): PrepareTlqvInvoiceBlocker[] {
  const blockers: PrepareTlqvInvoiceBlocker[] = [];

  if (!command.cacheReady) {
    blockers.push({
      code: 'CACHE_NOT_READY',
      message: 'Stock BUE TLQV cache is not ready. Refresh the cache first.',
    });
  }

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

  if (!command.stockBueItemFound) {
    blockers.push({
      code: 'NOT_FOUND_IN_STOCK_BUE',
      message: `${command.tlqvCode} was not found in the Stock BUE cache.`,
    });
  } else if (!command.isDispatched) {
    blockers.push({
      code: 'NOT_DISPATCHED',
      message: `${command.tlqvCode} is not marked as DESPACHADA in Stock BUE.`,
    });
  }

  return blockers;
}

function toStockBueItem(
  item: StockBueTlqvCacheItem,
): PrepareTlqvInvoiceStockBueItem {
  return {
    tlqvCode: item.tlqvCode,
    rowNumber: item.rowNumber,
    instruction: item.instruction,
    saleNumber: item.saleNumber,
    description: item.description,
    fechaRecepcion: item.fechaRecepcion,
    fechaSalida: item.fechaSalida,
    fechaLimite: item.fechaLimite,
    fechaInstruccion: item.fechaInstruccion,
    rawData: item.rawData,
  };
}

function normalizeInstruction(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === '' ? undefined : normalized;
}

function normalizeRequiredTlqvCode(value: string): string {
  const tlqvCode = normalizeTlqvCode(value);
  if (tlqvCode === undefined) {
    throw new RangeError('tlqvCode is required');
  }

  return tlqvCode;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'Unknown error';
}
