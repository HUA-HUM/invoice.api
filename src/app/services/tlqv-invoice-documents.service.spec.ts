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
      createStorageRepositoryMock(),
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
      createStorageRepositoryMock(),
    );

    const result = await service.generateCombinedPdf('TLQV-12948');

    expect(result.filename).toBe('TLQV-12948-factura.pdf');
  });

  it('returns the existing CDN PDF without regenerating it', async () => {
    const interactor = {
      execute: jest.fn(),
    };
    const pdfService = {
      generateCombinedPdf: jest.fn(),
    };
    const storageRepository = createStorageRepositoryMock({
      findExistingByTlqvCode: jest.fn().mockResolvedValue({
        key: 'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        url: 'https://cdn.test/invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        contentLength: 1234,
        eTag: '"etag"',
        lastModified: new Date('2026-07-16T00:00:00.000Z'),
      }),
    });
    const service = new TlqvInvoiceDocumentsService(
      interactor as never,
      pdfService as never,
      storageRepository,
    );

    const result = await service.getOrCreateCdnPdf('tlqv 12948');

    expect(result).toEqual({
      status: 'already_exists',
      tlqvCode: 'TLQV-12948',
      filename: 'TLQV-12948-factura-remito.pdf',
      cdnKey: 'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
      cdnUrl:
        'https://cdn.test/invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
      contentLength: 1234,
      eTag: '"etag"',
      lastModified: new Date('2026-07-16T00:00:00.000Z'),
    });
    expect(interactor.execute).not.toHaveBeenCalled();
    expect(pdfService.generateCombinedPdf).not.toHaveBeenCalled();
    expect(storageRepository.upload).not.toHaveBeenCalled();
  });

  it('generates and uploads the PDF when it is missing in CDN', async () => {
    const pdfBuffer = Buffer.from('%PDF-');
    const storageRepository = createStorageRepositoryMock({
      findExistingByTlqvCode: jest.fn().mockResolvedValue(null),
      buildTlqvDocumentKey: jest
        .fn()
        .mockReturnValue(
          'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        ),
      upload: jest.fn().mockResolvedValue({
        key: 'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        url: 'https://cdn.test/invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        contentLength: pdfBuffer.length,
        eTag: '"etag"',
        lastModified: null,
      }),
    });
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
        generateCombinedPdf: jest.fn().mockResolvedValue(pdfBuffer),
      } as never,
      storageRepository,
    );

    const result = await service.getOrCreateCdnPdf('TLQV-12948');

    expect(storageRepository.buildTlqvDocumentKey).toHaveBeenCalledWith(
      'TLQV-12948',
      'factura-remito.pdf',
    );
    expect(storageRepository.upload).toHaveBeenCalledWith({
      key: 'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
      filename: 'TLQV-12948-factura-remito.pdf',
      contentType: 'application/pdf',
      body: pdfBuffer,
    });
    expect(result.status).toBe('created');
    expect(result.cdnUrl).toBe(
      'https://cdn.test/invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
    );
  });
});

function createStorageRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findExistingByTlqvCode: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(null),
    upload: jest.fn(),
    buildPublicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
    buildTlqvDocumentKey: jest.fn(
      (tlqvCode: string, filename: string) =>
        `invoice-documents/tlqv/${tlqvCode}/${filename}`,
    ),
    ...overrides,
  } as never;
}
