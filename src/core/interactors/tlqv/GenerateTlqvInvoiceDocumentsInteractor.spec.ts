import type { IGetDetailsSkuRepository } from '../../adapters/repositories/catalog-sync-api/GetDetailsSku/IGetDetailsSkuRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetTlqvOrderDetailsRepository } from '../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type { MadreXubioComprobante } from '../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';
import {
  GenerateTlqvInvoiceDocumentsInteractor,
  TlqvInvoiceDocumentsNotFoundError,
} from './GenerateTlqvInvoiceDocumentsInteractor';

describe('GenerateTlqvInvoiceDocumentsInteractor', () => {
  it('builds document data from Madre, Ops API and Catalog Sync', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({
      items: [createComprobante()],
    });
    const orderRepository = createOrderDetailsRepository();
    orderRepository.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: {
        tlqvCode: 'TLQV-8821',
        source: 'ops_api',
        saleNumber: '2000011636781797',
        buyerData: {
          nombreDestinatario: 'NORIEDU S. R. L.',
        },
        product: {
          sku: 'B0BYZX8X9H',
          name: 'Arrocera Comercial',
        },
        rawPayload: {},
      },
    });
    const catalogRepository = createCatalogRepository();
    catalogRepository.getDetailsBySku.mockResolvedValue({
      found: true,
      productDetails: {
        sku: 'B0BYZX8X9H',
        title: 'Freidora De Aire Cosori',
        brand: 'Cosori',
        rawPayload: {},
      },
    });
    const interactor = new GenerateTlqvInvoiceDocumentsInteractor(
      comprobantesRepository,
      [orderRepository],
      catalogRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'tlqv 8821' });

    expect(comprobantesRepository.findFullByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-8821',
    });
    expect(orderRepository.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-8821',
    });
    expect(catalogRepository.getDetailsBySku).toHaveBeenCalledWith({
      sku: 'B0BYZX8X9H',
    });
    expect(result).toEqual({
      tlqvCode: 'TLQV-8821',
      comprobante: createComprobante(),
      orderDetails: expect.objectContaining({
        tlqvCode: 'TLQV-8821',
      }),
      catalogProductDetails: expect.objectContaining({
        sku: 'B0BYZX8X9H',
      }),
      warnings: [],
    });
  });

  it('does not block PDF generation when order details are unavailable', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({
      items: [createComprobante()],
    });
    const orderRepository = createOrderDetailsRepository();
    orderRepository.getByTlqvCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-8821',
      source: 'ops_api',
      reason: 'not_found',
    });
    const catalogRepository = createCatalogRepository();
    const interactor = new GenerateTlqvInvoiceDocumentsInteractor(
      comprobantesRepository,
      [orderRepository],
      catalogRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'TLQV-8821' });

    expect(result.comprobante).toEqual(createComprobante());
    expect(result.orderDetails).toBeNull();
    expect(result.catalogProductDetails).toBeNull();
    expect(result.warnings).toEqual([
      'Order details were not found for TLQV-8821',
    ]);
    expect(catalogRepository.getDetailsBySku).not.toHaveBeenCalled();
  });

  it('throws not found when Madre has no comprobante for TLQV', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({ items: [] });
    const interactor = new GenerateTlqvInvoiceDocumentsInteractor(
      comprobantesRepository,
      [],
      createCatalogRepository(),
    );

    await expect(
      interactor.execute({ tlqvCode: 'TLQV-99999' }),
    ).rejects.toBeInstanceOf(TlqvInvoiceDocumentsNotFoundError);
  });
});

function createComprobantesRepository() {
  return {
    createSyncRun: jest.fn(),
    updateSyncRun: jest.fn(),
    upsertBatch: jest.fn(),
    findByTlqvCodes: jest.fn(),
    findByTlqvCode: jest.fn(),
    findFullByTlqvCode: jest.fn(),
    existsByTlqvCode: jest.fn(),
  } as unknown as IMadreXubioComprobantesRepository & {
    findFullByTlqvCode: jest.Mock;
  };
}

function createOrderDetailsRepository() {
  return {
    getByTlqvCode: jest.fn(),
  } as unknown as IGetTlqvOrderDetailsRepository & {
    getByTlqvCode: jest.Mock;
  };
}

function createCatalogRepository() {
  return {
    getDetailsBySku: jest.fn(),
  } as unknown as IGetDetailsSkuRepository & {
    getDetailsBySku: jest.Mock;
  };
}

function createComprobante(): MadreXubioComprobante {
  return {
    xubioTransactionId: 70849784,
    numeroDocumento: 'A-00008-00000427',
    documentKind: 'INVOICE',
    descripcion: 'TLQV-8821 ML: 2000011636781797 Arrocera Comercial 18 Litros',
    tlqvCode: 'TLQV-8821',
    mlOrderId: '2000011636781797',
    fechaEmision: '2026-03-23T00:00:00.000Z',
    importeGravado: 921452.27,
    importeImpuestos: 32546.73,
    importeTotal: 953999,
    monedaNombre: 'Pesos Argentinos',
    clienteNombre: 'NORIEDU S. R. L.',
    cae: '86128709556080',
    fiscalmenteEmitido: true,
    rawDetailPayload: {},
    productItems: [],
  };
}
