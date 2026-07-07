import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IGetAllStockBueItemsRepository } from '../../adapters/repositories/spreadsheet-api/stock-bue/IGetAllStockBueItemsRepository';
import { RefreshStockBueTlqvCacheInteractor } from './RefreshStockBueTlqvCacheInteractor';

describe('RefreshStockBueTlqvCacheInteractor', () => {
  it('stores normalized unique TLQV rows and cache metadata', async () => {
    const stockBueRepository = createStockBueRepository();
    stockBueRepository.getAll.mockResolvedValue({
      pageSize: 100,
      totalRows: 4,
      totalPages: 1,
      rows: [
        {
          rowNumber: 2,
          data: {
            TLQV: 'tlqv-1',
            Instruccion: 'despachada',
            'N venta': '200001',
            Descripción: 'Primer item',
          },
        },
        {
          rowNumber: 3,
          data: {
            TLQV: 'TLQV-1',
            Instruccion: 'PENDIENTE',
          },
        },
        {
          rowNumber: 4,
          data: {
            TLQV: 'TLQV-2',
            Instruccion: 'PENDIENTE',
          },
        },
        {
          rowNumber: 5,
          data: {
            TLQV: '',
            Instruccion: 'DESPACHADA',
          },
        },
      ],
    });
    const cacheRepository = createCacheRepository();
    const interactor = new RefreshStockBueTlqvCacheInteractor(
      stockBueRepository,
      cacheRepository,
      () => new Date('2026-07-07T12:00:00.000Z'),
    );

    const result = await interactor.execute();

    expect(cacheRepository.replaceAll).toHaveBeenCalledWith({
      items: [
        {
          tlqvCode: 'TLQV-1',
          rowNumber: 2,
          instruction: 'DESPACHADA',
          saleNumber: '200001',
          description: 'Primer item',
          rawData: {
            TLQV: 'tlqv-1',
            Instruccion: 'despachada',
            'N venta': '200001',
            Descripción: 'Primer item',
          },
        },
        {
          tlqvCode: 'TLQV-2',
          rowNumber: 4,
          instruction: 'PENDIENTE',
          rawData: {
            TLQV: 'TLQV-2',
            Instruccion: 'PENDIENTE',
          },
        },
      ],
      metadata: {
        refreshedAt: '2026-07-07T12:00:00.000Z',
        totalSheetRows: 4,
        totalRowsWithTlqv: 3,
        totalRowsWithoutTlqv: 1,
        totalUniqueTlqv: 2,
        totalDispatchedRows: 2,
        totalDispatchedRowsWithTlqv: 1,
        totalDispatchedRowsWithoutTlqv: 1,
        totalUniqueDispatchedTlqv: 1,
        instructionCounts: {
          DESPACHADA: 1,
          PENDIENTE: 1,
        },
      },
    });
    expect(result).toMatchObject({
      status: 'completed',
      refreshedAt: '2026-07-07T12:00:00.000Z',
      totalSheetRows: 4,
      totalRowsWithTlqv: 3,
      totalRowsWithoutTlqv: 1,
      totalUniqueTlqv: 2,
      totalDispatchedRows: 2,
      totalDispatchedRowsWithTlqv: 1,
      totalDispatchedRowsWithoutTlqv: 1,
      totalUniqueDispatchedTlqv: 1,
      instructionCounts: {
        DESPACHADA: 1,
        PENDIENTE: 1,
      },
    });
  });
});

function createStockBueRepository(): IGetAllStockBueItemsRepository & {
  getAll: jest.Mock;
} {
  return {
    getAll: jest.fn(),
  };
}

function createCacheRepository(): IStockBueTlqvCacheRepository & {
  replaceAll: jest.Mock;
} {
  return {
    replaceAll: jest.fn(),
    getSnapshot: jest.fn(),
  };
}
