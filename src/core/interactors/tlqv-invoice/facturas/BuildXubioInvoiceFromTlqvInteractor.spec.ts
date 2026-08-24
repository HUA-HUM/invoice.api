import type { MadreItem } from '../../../entities/spreadsheet-api/madre/MadreItems';
import type { TlqvItem } from '../../../entities/spreadsheet-api/tlqv/TlqvItems';
import { BuildXubioInvoiceFromTlqvInteractor } from './BuildXubioInvoiceFromTlqvInteractor';

describe('BuildXubioInvoiceFromTlqvInteractor', () => {
  it('builds an A invoice using net values', () => {
    const result = new BuildXubioInvoiceFromTlqvInteractor().execute({
      tlqvCode: 'TLQV-15713',
      customerId: 10329110,
      fiscalCondition: 'RESPONSABLE INSCRIPTO',
      issueDate: '2026-07-30',
      tlqvSheetItem: createTlqvItem({
        Productoco: '204576.80',
        DIFACTURA: '0.00',
        TEFACTURA: '0.00',
        IVAFACTURA: '20014.56',
        LAFACTURA: '21280.00',
        FLETEINTERNACIONALA: '326354.12',
      }),
      madreSheetItem: createMadreItem({
        NROVENTA: '2000017369931210',
        COMISIONML: '$210,834.72',
        COSTOENVIO: '$7,470.00',
      }),
    });

    expect(result.invoiceLetter.letter).toBe('A');
    expect(result.invoice.description).toBe('TLQV-15713 ML: 2000017369931210');
    expect(result.invoice.items).toEqual([
      expect.objectContaining({
        productId: 2461025,
        unitPrice: 204576.8,
        priceWithVat: 0,
      }),
      expect.objectContaining({
        productId: 2461066,
        unitPrice: 20014.56,
        priceWithVat: 0,
      }),
      expect.objectContaining({
        productId: 2461080,
        unitPrice: 21280,
        priceWithVat: 0,
      }),
      expect.objectContaining({
        productId: 2460999,
        unitPrice: 174243.57,
        priceWithVat: 0,
      }),
      expect.objectContaining({
        productId: 2461000,
        unitPrice: 6173.55,
        priceWithVat: 0,
      }),
      expect.objectContaining({
        productId: 2461081,
        unitPrice: 326354.12,
        priceWithVat: 0,
      }),
    ]);
    expect(result.itemMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: 2461058,
          skipped: true,
          skippedReason: 'zero_or_empty_amount',
        }),
        expect.objectContaining({
          productId: 2461065,
          skipped: true,
          skippedReason: 'zero_or_empty_amount',
        }),
      ]),
    );
  });

  it('matches a real Xubio A invoice: DI/TE sent as-is (no VAT divisor) and Impuestos Internos multiplied by tc impuesto (TLQV-16887)', () => {
    const result = new BuildXubioInvoiceFromTlqvInteractor().execute({
      tlqvCode: 'TLQV-16887',
      customerId: 9557555,
      fiscalCondition: 'RESPONSABLE INSCRIPTO',
      issueDate: '2026-08-20',
      tlqvSheetItem: createTlqvItem({
        Productoco: '943046.00',
        DIFACTURA: '63083.97',
        TEFACTURA: '9461.85',
        IVAFACTURA: '215298.21',
        'Imp Internos': '93.30',
        'tc impuesto': '1499.50',
        LAFACTURA: '21280.00',
        FLETEINTERNACIONALA: '1795507.33',
      }),
      madreSheetItem: createMadreItem({
        NROVENTA: '2000017655168916',
        COMISIONML: '0',
        COSTOENVIO: '0',
      }),
    });

    expect(result.invoiceLetter.letter).toBe('A');
    expect(result.itemMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: 2461058,
          sourceField: 'DIFACTURA',
          amount: 63083.97,
          skipped: false,
        }),
        expect.objectContaining({
          productId: 2461065,
          sourceField: 'TEFACTURA',
          amount: 9461.85,
          skipped: false,
        }),
        expect.objectContaining({
          productId: 2826655,
          sourceField: 'Imp Internos',
          multiplierField: 'tc impuesto',
          multiplierValue: 1499.5,
          amount: 139903.35,
          skipped: false,
        }),
      ]),
    );
    expect(result.invoice.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: 2461058,
          unitPrice: 63083.97,
          priceWithVat: 0,
        }),
        expect.objectContaining({
          productId: 2461065,
          unitPrice: 9461.85,
          priceWithVat: 0,
        }),
        expect.objectContaining({
          productId: 2826655,
          unitPrice: 139903.35,
          priceWithVat: 0,
        }),
      ]),
    );
  });

  it('skips Impuestos Internos when the TLQV sheet does not have that value', () => {
    const result = new BuildXubioInvoiceFromTlqvInteractor().execute({
      tlqvCode: 'TLQV-14921',
      customerId: 10329110,
      fiscalCondition: 'RESPONSABLE INSCRIPTO',
      issueDate: '2026-07-30',
      tlqvSheetItem: createTlqvItem({
        Productoco: '204576.80',
        'tc impuesto': '1499.50',
      }),
      madreSheetItem: createMadreItem({ NROVENTA: '2000017369931210' }),
    });

    expect(result.itemMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: 2826655,
          skipped: true,
          skippedReason: 'zero_or_empty_amount',
        }),
      ]),
    );
  });

  it('builds a B invoice using VAT-included values', () => {
    const result = new BuildXubioInvoiceFromTlqvInteractor().execute({
      tlqvCode: 'TLQV-15738',
      customerId: 10329108,
      fiscalCondition: 'CONSUMIDOR FINAL',
      issueDate: '2026-07-30',
      tlqvSheetItem: createTlqvItem({
        Productoco: '139824.80',
        'DIFACTURA.B': '0.00',
        'TEFACTURA.B': '0.00',
        IVAFACTURA: '28513.22',
        'LAFACTURA.B': '25748.80',
        FLETEINTERNACIONALB: '118403.82',
      }),
      madreSheetItem: createMadreItem({
        NROVENTA: '2000017380549140',
        COMISIONML: '$126,288.52',
        COSTOENVIO: '$7,470.00',
      }),
    });

    expect(result.invoiceLetter.letter).toBe('B');
    expect(result.invoice.items).toEqual([
      expect.objectContaining({
        productId: 2461025,
        unitPrice: 139824.8,
        priceWithVat: 139824.8,
      }),
      expect.objectContaining({
        productId: 2461066,
        unitPrice: 28513.22,
        priceWithVat: 28513.22,
      }),
      expect.objectContaining({
        productId: 2461080,
        unitPrice: 25748.8,
        priceWithVat: 25748.8,
      }),
      expect.objectContaining({
        productId: 2460999,
        unitPrice: 126288.52,
        priceWithVat: 126288.52,
      }),
      expect.objectContaining({
        productId: 2461000,
        unitPrice: 7470,
        priceWithVat: 7470,
      }),
      expect.objectContaining({
        productId: 2461081,
        unitPrice: 118403.82,
        priceWithVat: 118403.82,
      }),
    ]);
  });
});

function createTlqvItem(overrides: Partial<TlqvItem['data']> = {}): TlqvItem {
  return {
    rowNumber: 10,
    data: {
      TLQV: 'TLQV-15713',
      'Valor Declarado': '0',
      Peso: '0',
      PESOVOLUMENTICO: '0',
      VALORXKG: '0',
      DI: '0',
      TE: '0',
      IVA: '0',
      'Total Impuestos': '0',
      'Total Flete': '0',
      'Fijo Liberacion': '0',
      Seguro: '0',
      Total: '0',
      tc: '0',
      tc2: '0',
      'tc impuesto': '0',
      Productoco: '0',
      'Productoco.b': '0',
      DIFACTURA: '0',
      'DIFACTURA.B': '0',
      TEFACTURA: '0',
      'TEFACTURA.B': '0',
      IVAFACTURA: '0',
      'IVAFACTURA.B': '0',
      LAFACTURA: '0',
      'LAFACTURA.B': '0',
      A13VENTA: '0',
      FLETEINTERNACIONALA: '0',
      FLETEINTERNACIONALB: '0',
      'NRO CARGA': '',
      ...overrides,
    },
  };
}

function createMadreItem(
  overrides: Partial<MadreItem['data']> = {},
): MadreItem {
  return {
    rowNumber: 20,
    data: {
      Identificador: 'TLQV-15713',
      NROVENTA: '',
      COMISIONML: '0',
      COSTOENVIO: '0',
      ...overrides,
    },
  };
}
