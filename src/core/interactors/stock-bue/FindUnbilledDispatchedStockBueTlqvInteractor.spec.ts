import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { StockBueTlqvCacheSnapshot } from '../../entities/cache/stock-bue/StockBueTlqvCache';
import {
  FindUnbilledDispatchedStockBueTlqvInteractor,
  StockBueTlqvCacheNotReadyError,
} from './FindUnbilledDispatchedStockBueTlqvInteractor';

describe('FindUnbilledDispatchedStockBueTlqvInteractor', () => {
  it('returns dispatched cached TLQV codes that are not billed in comprobantes', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getSnapshot.mockResolvedValue(
      createSnapshot({
        items: [
          {
            tlqvCode: 'TLQV-1',
            rowNumber: 2,
            instruction: 'DESPACHADA',
            saleNumber: '200001',
            description: 'Facturado',
            rawData: {
              TLQV: 'TLQV-1',
              'N venta': '200001',
              Descripción: 'Facturado',
              Instruccion: 'DESPACHADA',
            },
          },
          {
            tlqvCode: 'TLQV-2',
            rowNumber: 3,
            instruction: 'PENDIENTE',
            description: 'No despachado',
            rawData: {
              TLQV: 'TLQV-2',
              Descripción: 'No despachado',
              Instruccion: 'PENDIENTE',
            },
          },
          {
            tlqvCode: 'TLQV-3',
            rowNumber: 4,
            instruction: 'DESPACHADA',
            saleNumber: '200003',
            description: 'No facturado',
            fechaRecepcion: '26-12-24',
            rawData: {
              TLQV: ' tlqv-3 ',
              'N venta': '200003',
              Descripción: 'No facturado',
              Instruccion: ' despachada ',
              'Fecha recepcion': '26-12-24',
            },
          },
        ],
      }),
    );

    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findByTlqvCodes.mockResolvedValue({
      items: [
        { tlqvCode: 'TLQV-1', documentKind: 'INVOICE' },
        { tlqvCode: 'TLQV-3', documentKind: 'CREDIT_NOTE' },
      ],
    });

    const interactor = new FindUnbilledDispatchedStockBueTlqvInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute();

    expect(comprobantesRepository.findByTlqvCodes).toHaveBeenCalledWith({
      tlqvCodes: ['TLQV-1', 'TLQV-3'],
    });
    expect(result).toMatchObject({
      status: 'completed',
      instruction: 'DESPACHADA',
      cacheRefreshedAt: '2026-07-07T12:00:00.000Z',
      totalCacheTlqv: 3,
      totalSheetRows: 5,
      totalDispatchedRows: 4,
      totalDispatchedRowsWithoutTlqv: 1,
      totalUniqueDispatchedTlqv: 2,
      totalBilledTlqv: 1,
      totalUnbilledTlqv: 1,
      items: [
        {
          tlqvCode: 'TLQV-3',
          rowNumber: 4,
          saleNumber: '200003',
          description: 'No facturado',
          instruction: 'DESPACHADA',
          fechaRecepcion: '26-12-24',
        },
      ],
    });
  });

  it('queries comprobantes in batches', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getSnapshot.mockResolvedValue(
      createSnapshot({
        items: [
          createDispatchedCacheItem('TLQV-1', 2),
          createDispatchedCacheItem('TLQV-2', 3),
          createDispatchedCacheItem('TLQV-3', 4),
        ],
        totalSheetRows: 3,
        totalDispatchedRows: 3,
        totalDispatchedRowsWithTlqv: 3,
        totalDispatchedRowsWithoutTlqv: 0,
        totalUniqueDispatchedTlqv: 3,
      }),
    );

    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findByTlqvCodes.mockResolvedValue({ items: [] });

    const interactor = new FindUnbilledDispatchedStockBueTlqvInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    await interactor.execute({ comprobantesBatchSize: 2 });

    expect(comprobantesRepository.findByTlqvCodes).toHaveBeenNthCalledWith(1, {
      tlqvCodes: ['TLQV-1', 'TLQV-2'],
    });
    expect(comprobantesRepository.findByTlqvCodes).toHaveBeenNthCalledWith(2, {
      tlqvCodes: ['TLQV-3'],
    });
  });

  it('fails clearly when the cache was not refreshed yet', async () => {
    const cacheRepository = createCacheRepository();
    cacheRepository.getSnapshot.mockResolvedValue({
      items: [],
    });
    const comprobantesRepository = createComprobantesRepository();
    const interactor = new FindUnbilledDispatchedStockBueTlqvInteractor(
      cacheRepository,
      comprobantesRepository,
    );

    await expect(interactor.execute()).rejects.toBeInstanceOf(
      StockBueTlqvCacheNotReadyError,
    );
    expect(comprobantesRepository.findByTlqvCodes).not.toHaveBeenCalled();
  });
});

function createCacheRepository(): IStockBueTlqvCacheRepository & {
  getSnapshot: jest.Mock;
} {
  return {
    replaceAll: jest.fn(),
    getSnapshot: jest.fn(),
  };
}

function createComprobantesRepository(): IMadreXubioComprobantesRepository & {
  findByTlqvCodes: jest.Mock;
} {
  return {
    createSyncRun: jest.fn(),
    updateSyncRun: jest.fn(),
    upsertBatch: jest.fn(),
    findByTlqvCodes: jest.fn(),
  };
}

function createSnapshot(
  overrides: Partial<StockBueTlqvCacheSnapshot> & {
    totalSheetRows?: number;
    totalDispatchedRows?: number;
    totalDispatchedRowsWithTlqv?: number;
    totalDispatchedRowsWithoutTlqv?: number;
    totalUniqueDispatchedTlqv?: number;
  } = {},
): StockBueTlqvCacheSnapshot {
  const items = overrides.items ?? [];

  return {
    metadata: {
      refreshedAt: '2026-07-07T12:00:00.000Z',
      totalSheetRows: overrides.totalSheetRows ?? 5,
      totalRowsWithTlqv: items.length,
      totalRowsWithoutTlqv: 0,
      totalUniqueTlqv: items.length,
      totalDispatchedRows: overrides.totalDispatchedRows ?? 4,
      totalDispatchedRowsWithTlqv: overrides.totalDispatchedRowsWithTlqv ?? 3,
      totalDispatchedRowsWithoutTlqv:
        overrides.totalDispatchedRowsWithoutTlqv ?? 1,
      totalUniqueDispatchedTlqv: overrides.totalUniqueDispatchedTlqv ?? 2,
      instructionCounts: {
        DESPACHADA: items.filter((item) => item.instruction === 'DESPACHADA')
          .length,
      },
    },
    items,
  };
}

function createDispatchedCacheItem(tlqvCode: string, rowNumber: number) {
  return {
    tlqvCode,
    rowNumber,
    instruction: 'DESPACHADA',
    rawData: {
      TLQV: tlqvCode,
      Instruccion: 'DESPACHADA',
    },
  };
}
