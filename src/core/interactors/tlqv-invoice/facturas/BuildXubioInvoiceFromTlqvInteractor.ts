import type { MadreItem } from '../../../entities/spreadsheet-api/madre/MadreItems';
import type { TlqvItem } from '../../../entities/spreadsheet-api/tlqv/TlqvItems';
import type {
  XubioInvoice,
  XubioInvoiceItem,
  XubioInvoiceLetter,
} from '../../../entities/xubio/facturas/XubioInvoice';
import {
  resolveXubioInvoiceLetterFromFiscalCondition,
  type ResolveXubioInvoiceLetterResponse,
} from '../../xubio/facturas/ResolveXubioInvoiceLetterInteractor';

const DEFAULT_POINT_OF_SALE_ID = 216731;
const DEFAULT_WAREHOUSE_ID = -2;
const VAT_21_DIVISOR = 1.21;

const XUBIO_PRODUCT_IDS = {
  pagosPorCuentaYOrden: 2461025,
  derechosImportacion: 2461058,
  tasaEstadistica: 2461065,
  ivaImportacion: 2461066,
  gastosDocumentalesAduana: 2461080,
  comisionesExternas: 2460999,
  fletesDomesticos: 2461000,
  fleteInternacional: 2461081,
} as const;

export interface BuildXubioInvoiceFromTlqvCommand {
  tlqvCode: string;
  customerId: number;
  fiscalCondition?: string | null;
  tlqvSheetItem: TlqvItem;
  madreSheetItem: MadreItem;
  issueDate: string;
  dueDate?: string;
  pointOfSaleId?: number;
  warehouseId?: number;
}

export interface BuildXubioInvoiceFromTlqvResponse {
  invoice: XubioInvoice;
  invoiceLetter: ResolveXubioInvoiceLetterResponse;
  itemMappings: XubioInvoiceItemMapping[];
}

export interface XubioInvoiceItemMapping {
  concept: string;
  productId: number;
  sourceSheet: 'TLQV' | 'MADRE';
  sourceField: string;
  rawValue: string | number | boolean | string[] | null | undefined;
  amount: number;
  divisor?: number;
  skipped: boolean;
  skippedReason?: 'zero_or_empty_amount';
}

type TlqvItemData = TlqvItem['data'];
type MadreItemData = MadreItem['data'];

type InvoiceItemDefinition = {
  concept: string;
  productId: number;
  sourceSheet: 'TLQV' | 'MADRE';
  sourceField: string;
  divisor?: number;
};

export class BuildXubioInvoiceFromTlqvInteractor {
  execute(
    command: BuildXubioInvoiceFromTlqvCommand,
  ): BuildXubioInvoiceFromTlqvResponse {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);
    validatePositiveInteger(command.customerId, 'customerId');
    validateIsoDate(command.issueDate, 'issueDate');

    const dueDate = command.dueDate ?? command.issueDate;
    validateIsoDate(dueDate, 'dueDate');

    const pointOfSaleId = command.pointOfSaleId ?? DEFAULT_POINT_OF_SALE_ID;
    const warehouseId = command.warehouseId ?? DEFAULT_WAREHOUSE_ID;
    validatePositiveInteger(pointOfSaleId, 'pointOfSaleId');
    validateInteger(warehouseId, 'warehouseId');

    const invoiceLetter = resolveXubioInvoiceLetterFromFiscalCondition(
      command.fiscalCondition,
    );
    const itemMappings = buildItemMappings(
      invoiceLetter.letter,
      command.tlqvSheetItem.data,
      command.madreSheetItem.data,
    );
    const items = itemMappings
      .filter((mapping) => !mapping.skipped)
      .map((mapping) =>
        toXubioInvoiceItem(mapping, invoiceLetter.letter, warehouseId),
      );

    if (items.length === 0) {
      throw new RangeError(`${tlqvCode} does not have invoice items to create`);
    }

    return {
      invoiceLetter,
      itemMappings,
      invoice: {
        type: 'Factura',
        letter: invoiceLetter.letter,
        customerId: command.customerId,
        issueDate: command.issueDate,
        dueDate,
        pointOfSaleId,
        description: buildInvoiceDescription(tlqvCode, command.madreSheetItem),
        exchangeRate: 1,
        items,
      },
    };
  }
}

function buildItemMappings(
  letter: XubioInvoiceLetter,
  tlqvData: TlqvItemData,
  madreData: MadreItemData,
): XubioInvoiceItemMapping[] {
  return getInvoiceItemDefinitions(letter).map((definition) => {
    const rawValue =
      definition.sourceSheet === 'TLQV'
        ? tlqvData[definition.sourceField]
        : madreData[definition.sourceField];
    const amount = roundMoney(
      parseMoneyLikeNumber(rawValue) / (definition.divisor ?? 1),
    );

    if (amount === 0) {
      return {
        ...definition,
        rawValue,
        amount,
        skipped: true,
        skippedReason: 'zero_or_empty_amount',
      };
    }

    return {
      ...definition,
      rawValue,
      amount,
      skipped: false,
    };
  });
}

function getInvoiceItemDefinitions(
  letter: XubioInvoiceLetter,
): InvoiceItemDefinition[] {
  if (letter === 'A') {
    return [
      {
        concept: 'Pagos por cuenta y orden',
        productId: XUBIO_PRODUCT_IDS.pagosPorCuentaYOrden,
        sourceSheet: 'TLQV',
        sourceField: 'Productoco',
      },
      {
        concept: 'Derechos de importacion pagados por cuenta y orden',
        productId: XUBIO_PRODUCT_IDS.derechosImportacion,
        sourceSheet: 'TLQV',
        sourceField: 'DIFACTURA',
        divisor: VAT_21_DIVISOR,
      },
      {
        concept: 'Tasa de estadística pagados por cuenta y orden',
        productId: XUBIO_PRODUCT_IDS.tasaEstadistica,
        sourceSheet: 'TLQV',
        sourceField: 'TEFACTURA',
        divisor: VAT_21_DIVISOR,
      },
      {
        concept: 'Iva importacion pagados por cuenta y orden',
        productId: XUBIO_PRODUCT_IDS.ivaImportacion,
        sourceSheet: 'TLQV',
        sourceField: 'IVAFACTURA',
      },
      {
        concept: 'Gastos documentales Aduana',
        productId: XUBIO_PRODUCT_IDS.gastosDocumentalesAduana,
        sourceSheet: 'TLQV',
        sourceField: 'LAFACTURA',
      },
      {
        concept: 'Comisiones externas',
        productId: XUBIO_PRODUCT_IDS.comisionesExternas,
        sourceSheet: 'MADRE',
        sourceField: 'COMISIONML',
        divisor: VAT_21_DIVISOR,
      },
      {
        concept: 'Fletes domesticos',
        productId: XUBIO_PRODUCT_IDS.fletesDomesticos,
        sourceSheet: 'MADRE',
        sourceField: 'COSTOENVIO',
        divisor: VAT_21_DIVISOR,
      },
      {
        concept: 'Flete internacional',
        productId: XUBIO_PRODUCT_IDS.fleteInternacional,
        sourceSheet: 'TLQV',
        sourceField: 'FLETEINTERNACIONALA',
      },
    ];
  }

  return [
    {
      concept: 'Pagos por cuenta y orden',
      productId: XUBIO_PRODUCT_IDS.pagosPorCuentaYOrden,
      sourceSheet: 'TLQV',
      sourceField: 'Productoco',
    },
    {
      concept: 'Derechos de importacion pagados por cuenta y orden',
      productId: XUBIO_PRODUCT_IDS.derechosImportacion,
      sourceSheet: 'TLQV',
      sourceField: 'DIFACTURA.B',
    },
    {
      concept: 'Tasa de estadística pagados por cuenta y orden',
      productId: XUBIO_PRODUCT_IDS.tasaEstadistica,
      sourceSheet: 'TLQV',
      sourceField: 'TEFACTURA.B',
    },
    {
      concept: 'Iva importacion pagados por cuenta y orden',
      productId: XUBIO_PRODUCT_IDS.ivaImportacion,
      sourceSheet: 'TLQV',
      sourceField: 'IVAFACTURA',
    },
    {
      concept: 'Gastos documentales Aduana',
      productId: XUBIO_PRODUCT_IDS.gastosDocumentalesAduana,
      sourceSheet: 'TLQV',
      sourceField: 'LAFACTURA.B',
    },
    {
      concept: 'Comisiones externas',
      productId: XUBIO_PRODUCT_IDS.comisionesExternas,
      sourceSheet: 'MADRE',
      sourceField: 'COMISIONML',
    },
    {
      concept: 'Fletes domesticos',
      productId: XUBIO_PRODUCT_IDS.fletesDomesticos,
      sourceSheet: 'MADRE',
      sourceField: 'COSTOENVIO',
    },
    {
      concept: 'Flete internacional',
      productId: XUBIO_PRODUCT_IDS.fleteInternacional,
      sourceSheet: 'TLQV',
      sourceField: 'FLETEINTERNACIONALB',
    },
  ];
}

function toXubioInvoiceItem(
  mapping: XubioInvoiceItemMapping,
  letter: XubioInvoiceLetter,
  warehouseId: number,
): XubioInvoiceItem {
  return {
    productId: mapping.productId,
    warehouseId,
    description: mapping.concept,
    quantity: 1,
    unitPrice: mapping.amount,
    priceWithVat: letter === 'B' ? mapping.amount : 0,
    discountPercentage: 0,
  };
}

function buildInvoiceDescription(tlqvCode: string, madreItem: MadreItem) {
  const saleNumber = stringifyCellValue(madreItem.data.NROVENTA);
  if (saleNumber !== null) {
    return `${tlqvCode} ML: ${saleNumber}`;
  }

  return tlqvCode;
}

function parseMoneyLikeNumber(
  value: string | number | boolean | string[] | null | undefined,
): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return parseMoneyLikeNumber(value[0]);
  }

  const sanitized = value
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');

  if (sanitized === '' || sanitized === '-' || sanitized === ',') {
    return 0;
  }

  const decimalNormalized = normalizeDecimalSeparators(sanitized);
  const parsed = Number(decimalNormalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDecimalSeparators(value: string): string {
  const lastCommaIndex = value.lastIndexOf(',');
  const lastDotIndex = value.lastIndexOf('.');

  if (lastCommaIndex !== -1 && lastDotIndex !== -1) {
    if (lastCommaIndex > lastDotIndex) {
      return value.replace(/\./g, '').replace(',', '.');
    }

    return value.replace(/,/g, '');
  }

  if (lastCommaIndex !== -1) {
    const decimalDigits = value.length - lastCommaIndex - 1;
    if (decimalDigits > 0 && decimalDigits <= 2) {
      return value.replace(',', '.');
    }

    return value.replace(/,/g, '');
  }

  return value;
}

function stringifyCellValue(
  value: string | number | boolean | string[] | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? null : stringifyCellValue(value[0]);
  }

  const stringValue = String(value).trim();
  return stringValue === '' ? null : stringValue;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeRequiredTlqvCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === '') {
    throw new RangeError('tlqvCode is required');
  }

  const match = normalized.match(/TLQV-\d+/);
  return match?.[0] ?? normalized;
}

function validateIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${field} must be an ISO date`);
  }
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

function validateInteger(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${field} must be an integer`);
  }
}
