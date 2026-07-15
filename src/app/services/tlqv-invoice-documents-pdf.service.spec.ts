import type { ConfigService } from '@nestjs/config';
import type { TlqvInvoiceDocumentsData } from '../../core/entities/tlqv/TlqvInvoiceDocuments';
import { TlqvInvoiceDocumentsPdfService } from './tlqv-invoice-documents-pdf.service';

describe('TlqvInvoiceDocumentsPdfService', () => {
  it('generates a combined PDF buffer', async () => {
    const service = new TlqvInvoiceDocumentsPdfService({
      get: jest.fn(),
    } as unknown as ConfigService);

    const buffer = await service.generateCombinedPdf(createDocumentData());

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('fetches and embeds the catalog product thumbnail when available', async () => {
    const originalFetch = global.fetch;
    const imageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'image/png' : null,
      },
      arrayBuffer: async () =>
        imageBuffer.buffer.slice(
          imageBuffer.byteOffset,
          imageBuffer.byteOffset + imageBuffer.byteLength,
        ),
    }) as unknown as typeof fetch;
    const service = new TlqvInvoiceDocumentsPdfService({
      get: jest.fn(),
    } as unknown as ConfigService);

    try {
      const buffer = await service.generateCombinedPdf({
        ...createDocumentData(),
        catalogProductDetails: {
          ...createDocumentData().catalogProductDetails!,
          thumbnail: 'https://images.example.test/product.png',
        },
      });

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://images.example.test/product.png',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

function createDocumentData(): TlqvInvoiceDocumentsData {
  return {
    tlqvCode: 'TLQV-8821',
    comprobante: {
      xubioTransactionId: 70849784,
      numeroDocumento: 'A-00008-00000427',
      documentKind: 'INVOICE',
      descripcion:
        'TLQV-8821 ML: 2000011636781797 Arrocera Comercial 18 Litros',
      tlqvCode: 'TLQV-8821',
      mlOrderId: '2000011636781797',
      fechaEmision: '2026-03-23T00:00:00.000Z',
      fechaVencimiento: '2026-03-23T00:00:00.000Z',
      importeGravado: 921452.27,
      importeImpuestos: 32546.73,
      importeTotal: 953999,
      monedaNombre: 'Pesos Argentinos',
      condicionPago: 1,
      clienteNombre: 'NORIEDU S. R. L.',
      provinciaNombre: 'Ciudad Autónoma de Buenos Aires',
      cae: '86128709556080',
      caeFechaVencimiento: '2026-04-02T00:00:00.000Z',
      fiscalmenteEmitido: true,
      rawDetailPayload: {},
      productItems: [
        {
          productoCodigo: 'PAGOS_POR_CUENTA_Y_ORDEN',
          productoNombre: 'Pagos por cuenta y orden',
          descripcion: 'Pagos por cuenta y orden',
          cantidad: 1,
          precio: 214485.7,
          importe: 214485.7,
          iva: 0,
          total: 214485.7,
          porcentajeDescuento: 0,
          rawPayload: {},
        },
      ],
    },
    orderDetails: {
      tlqvCode: 'TLQV-8821',
      source: 'ops_api',
      saleNumber: '2000011636781797',
      buyerData: {
        nombreDestinatario: 'NORIEDU S. R. L.',
        direccion: 'Av. Siempre Viva 123',
        ciudad: 'CABA',
        provincia: 'Buenos Aires',
        codigoPostal: '1000',
      },
      product: {
        sku: 'B0BYZX8X9H',
        name: 'Arrocera Comercial 18 Litros',
        unitCount: 1,
      },
      statuses: {
        estadoVbi: 'ENTREGADO',
      },
      rawPayload: {},
    },
    catalogProductDetails: {
      sku: 'B0BYZX8X9H',
      title: 'Arrocera Comercial',
      brand: 'Marca',
      price: 953999,
      currencyId: 'ARS',
      rawPayload: {},
    },
    warnings: [],
  };
}
