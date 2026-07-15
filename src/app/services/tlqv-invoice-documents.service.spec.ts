import { TlqvInvoiceDocumentsService } from './tlqv-invoice-documents.service';

describe('TlqvInvoiceDocumentsService', () => {
  it('names the PDF as factura-remito when order and catalog data are available', async () => {
    const service = new TlqvInvoiceDocumentsService(
      {
        execute: jest.fn().mockResolvedValue({
          tlqvCode: 'TLQV-12948',
          comprobante: {},
          orderDetails: {},
          catalogProductDetails: {},
          warnings: [],
        }),
      } as never,
      {
        generateCombinedPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
      } as never,
    );

    const result = await service.generateCombinedPdf('TLQV-12948');

    expect(result.filename).toBe('TLQV-12948-factura-remito.pdf');
  });

  it('names the PDF as factura when external data is missing', async () => {
    const service = new TlqvInvoiceDocumentsService(
      {
        execute: jest.fn().mockResolvedValue({
          tlqvCode: 'TLQV-12948',
          comprobante: {},
          orderDetails: null,
          catalogProductDetails: null,
          warnings: [],
        }),
      } as never,
      {
        generateCombinedPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
      } as never,
    );

    const result = await service.generateCombinedPdf('TLQV-12948');

    expect(result.filename).toBe('TLQV-12948-factura.pdf');
  });
});
