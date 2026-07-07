import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetAllStockBueItemsRepository } from '../../adapters/repositories/spreadsheet-api/stock-bue/IGetAllStockBueItemsRepository';
import { FindUnbilledDispatchedStockBueTlqvInteractor } from './FindUnbilledDispatchedStockBueTlqvInteractor';

describe('FindUnbilledDispatchedStockBueTlqvInteractor', () => {
  it('returns dispatched stock-bue TLQV codes that are not in comprobantes', async () => {
    const stockBueRepository = createStockBueRepository();
    stockBueRepository.getAll.mockResolvedValue({
      pageSize: 100,
      totalRows: 5,
      totalPages: 1,
      rows: [
        {
          rowNumber: 2,
          data: {
            TLQV: 'TLQV-1',
            'N venta': '200001',
            Descripción: 'Facturado',
            Instruccion: 'DESPACHADA',
          },
        },
        {
          rowNumber: 3,
          data: {
            TLQV: 'TLQV-2',
            Descripción: 'No despachado',
            Instruccion: 'PENDIENTE',
          },
        },
        {
          rowNumber: 4,
          data: {
            TLQV: ' tlqv-3 ',
            'N venta': '200003',
            Descripción: 'No facturado',
            Instruccion: ' despachada ',
            'Fecha recepcion': '26-12-24',
          },
        },
        {
          rowNumber: 5,
          data: {
            TLQV: 'TLQV-1',
            Descripción: 'Duplicado',
            Instruccion: 'DESPACHADA',
          },
        },
        {
          rowNumber: 6,
          data: {
            TLQV: '',
            Instruccion: 'DESPACHADA',
          },
        },
      ],
    });

    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findByTlqvCodes.mockResolvedValue({
      items: [{ tlqvCode: 'TLQV-1' }],
    });

    const interactor = new FindUnbilledDispatchedStockBueTlqvInteractor(
      stockBueRepository,
      comprobantesRepository,
    );

    const result = await interactor.execute();

    expect(comprobantesRepository.findByTlqvCodes).toHaveBeenCalledWith({
      tlqvCodes: ['TLQV-1', 'TLQV-3'],
    });
    expect(result).toMatchObject({
      status: 'completed',
      instruction: 'DESPACHADA',
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
    const stockBueRepository = createStockBueRepository();
    stockBueRepository.getAll.mockResolvedValue({
      pageSize: 100,
      totalRows: 3,
      totalPages: 1,
      rows: [
        { rowNumber: 2, data: { TLQV: 'TLQV-1', Instruccion: 'DESPACHADA' } },
        { rowNumber: 3, data: { TLQV: 'TLQV-2', Instruccion: 'DESPACHADA' } },
        { rowNumber: 4, data: { TLQV: 'TLQV-3', Instruccion: 'DESPACHADA' } },
      ],
    });

    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.findByTlqvCodes.mockResolvedValue({ items: [] });

    const interactor = new FindUnbilledDispatchedStockBueTlqvInteractor(
      stockBueRepository,
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
});

function createStockBueRepository(): IGetAllStockBueItemsRepository & {
  getAll: jest.Mock;
} {
  return {
    getAll: jest.fn(),
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
