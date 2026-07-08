import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import { PrepareTlqvInvoiceInteractor } from './PrepareTlqvInvoiceInteractor';

describe('PrepareTlqvInvoiceInteractor', () => {
  it('returns READY when TLQV is not billed and is dispatched', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getByTlqvCode.mockResolvedValue({
      metadata: createCacheMetadata(),
      item: createCacheItem('TLQV-14027', 'DESPACHADA'),
    });
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: false,
    });
    const interactor = new PrepareTlqvInvoiceInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute({ tlqvCode: ' tlqv-14027 ' });

    expect(cacheRepository.getByTlqvCode).toHaveBeenCalledWith('TLQV-14027');
    expect(comprobantesRepository.existsByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14027',
    });
    expect(comprobantesRepository.findByTlqvCodes).not.toHaveBeenCalled();
    expect(comprobantesRepository.findByTlqvCode).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'READY',
      canContinue: true,
      tlqvCode: 'TLQV-14027',
      isBilled: false,
      isDispatched: true,
      billingValidationAvailable: true,
      blockers: [],
      stockBueItem: {
        tlqvCode: 'TLQV-14027',
        instruction: 'DESPACHADA',
      },
    });
  });

  it('blocks when TLQV already has an invoice comprobante', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getByTlqvCode.mockResolvedValue({
      metadata: createCacheMetadata(),
      item: createCacheItem('TLQV-14027', 'DESPACHADA'),
    });
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: true,
    });
    const interactor = new PrepareTlqvInvoiceInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('BLOCKED');
    expect(result.canContinue).toBe(false);
    expect(result.isBilled).toBe(true);
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'ALREADY_BILLED' }),
    ]);
  });

  it('returns READY when Madre says TLQV has no invoice comprobante', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getByTlqvCode.mockResolvedValue({
      metadata: createCacheMetadata(),
      item: createCacheItem('TLQV-14027', 'DESPACHADA'),
    });
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: false,
    });
    const interactor = new PrepareTlqvInvoiceInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('READY');
    expect(result.isBilled).toBe(false);
  });

  it('blocks when TLQV is not dispatched', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getByTlqvCode.mockResolvedValue({
      metadata: createCacheMetadata(),
      item: createCacheItem('TLQV-14027', 'PENDIENTE'),
    });
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: false,
    });
    const interactor = new PrepareTlqvInvoiceInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('BLOCKED');
    expect(result.canContinue).toBe(false);
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'NOT_DISPATCHED' }),
    ]);
  });

  it('blocks clearly when the stock-bue cache is not ready', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getByTlqvCode.mockResolvedValue({});
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: false,
    });
    const interactor = new PrepareTlqvInvoiceInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'CACHE_NOT_READY' }),
      expect.objectContaining({ code: 'NOT_FOUND_IN_STOCK_BUE' }),
    ]);
  });

  it('blocks safely when billing validation against Madre is unavailable', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getByTlqvCode.mockResolvedValue({
      metadata: createCacheMetadata(),
      item: createCacheItem('TLQV-14027', 'DESPACHADA'),
    });
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockRejectedValue(
      new Error('timeout of 20000ms exceeded'),
    );
    const interactor = new PrepareTlqvInvoiceInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('BLOCKED');
    expect(result.canContinue).toBe(false);
    expect(result.isBilled).toBe(false);
    expect(result.billingValidationAvailable).toBe(false);
    expect(result.billingValidationErrorMessage).toBe(
      'timeout of 20000ms exceeded',
    );
    expect(result.billedComprobantes).toEqual([]);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'BILLING_VALIDATION_UNAVAILABLE',
      }),
    ]);
  });
});

function createCacheRepository(): IStockBueTlqvCacheRepository & {
  getByTlqvCode: jest.Mock;
} {
  return {
    replaceAll: jest.fn(),
    getSnapshot: jest.fn(),
    getByTlqvCode: jest.fn(),
  };
}

function createComprobantesRepository(): IMadreXubioComprobantesRepository & {
  findByTlqvCodes: jest.Mock;
  findByTlqvCode: jest.Mock;
  existsByTlqvCode: jest.Mock;
} {
  return {
    createSyncRun: jest.fn(),
    updateSyncRun: jest.fn(),
    upsertBatch: jest.fn(),
    findByTlqvCodes: jest.fn(),
    findByTlqvCode: jest.fn(),
    existsByTlqvCode: jest.fn(),
  };
}

function createCacheItem(tlqvCode: string, instruction: string) {
  return {
    tlqvCode,
    rowNumber: 10,
    instruction,
    saleNumber: '200001111',
    description: 'Producto test',
    rawData: {
      TLQV: tlqvCode,
      Instruccion: instruction,
      'N venta': '200001111',
      Descripción: 'Producto test',
    },
  };
}

function createCacheMetadata() {
  return {
    refreshedAt: '2026-07-07T12:00:00.000Z',
    totalSheetRows: 10,
    totalRowsWithTlqv: 10,
    totalRowsWithoutTlqv: 0,
    totalUniqueTlqv: 10,
    totalDispatchedRows: 8,
    totalDispatchedRowsWithTlqv: 8,
    totalDispatchedRowsWithoutTlqv: 0,
    totalUniqueDispatchedTlqv: 8,
    instructionCounts: {
      DESPACHADA: 8,
    },
  };
}
