import type { IGetOneStockBueItemsRepository } from '../../../../adapters/repositories/spreadsheet-api/stock-bue/IGetOneStockBueItemsRepository';
import type {
  GetOneStockBueItemsCommand,
  GetOneStockBueItemsResponse,
} from '../../../../entities/spreadsheet-api/stock-bue/StockBueItems';
import {
  GetAllStockBueItemsRepository,
  StockBueSpreadsheetApiPaginationError,
} from './GetAllStockBueItemsRepository';

describe('GetAllStockBueItemsRepository', () => {
  it('collects all pages even when spreadsheet total metadata changes while reading', async () => {
    const getOneStockBueItemsRepository = createGetOneRepository([
      createPage({
        page: 1,
        totalRows: 2,
        totalPages: 2,
        hasNextPage: true,
        rowNumbers: [1],
      }),
      createPage({
        page: 2,
        totalRows: 3,
        totalPages: 3,
        hasPreviousPage: true,
        rowNumbers: [2, 3],
      }),
    ]);
    const repository = new GetAllStockBueItemsRepository(
      getOneStockBueItemsRepository,
    );

    await expect(repository.getAll({ pageSize: 100 })).resolves.toEqual({
      pageSize: 100,
      totalRows: 3,
      totalPages: 2,
      rows: [
        { rowNumber: 1, data: { TLQV: 'TLQV-1' } },
        { rowNumber: 2, data: { TLQV: 'TLQV-2' } },
        { rowNumber: 3, data: { TLQV: 'TLQV-3' } },
      ],
    });
  });

  it('skips duplicate row numbers if a live spreadsheet shifts between pages', async () => {
    const getOneStockBueItemsRepository = createGetOneRepository([
      createPage({
        page: 1,
        totalRows: 3,
        totalPages: 2,
        hasNextPage: true,
        rowNumbers: [1, 2],
      }),
      createPage({
        page: 2,
        totalRows: 3,
        totalPages: 2,
        hasPreviousPage: true,
        rowNumbers: [2, 3],
      }),
    ]);
    const repository = new GetAllStockBueItemsRepository(
      getOneStockBueItemsRepository,
    );

    const response = await repository.getAll({ pageSize: 100 });

    expect(response.rows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
    expect(response.totalRows).toBe(3);
  });

  it('still fails on invalid page sequence', async () => {
    const getOneStockBueItemsRepository = createGetOneRepository([
      createPage({
        page: 2,
        totalRows: 1,
        totalPages: 1,
        rowNumbers: [1],
      }),
    ]);
    const repository = new GetAllStockBueItemsRepository(
      getOneStockBueItemsRepository,
    );

    await expect(repository.getAll({ pageSize: 100 })).rejects.toThrow(
      StockBueSpreadsheetApiPaginationError,
    );
  });
});

function createGetOneRepository(
  pages: GetOneStockBueItemsResponse[],
): IGetOneStockBueItemsRepository {
  return {
    getOne: jest.fn(
      (
        command: GetOneStockBueItemsCommand,
      ): Promise<GetOneStockBueItemsResponse> => {
        const page = pages[command.page - 1];
        if (page === undefined) {
          return Promise.reject(new Error(`Unexpected page ${command.page}`));
        }

        return Promise.resolve(page);
      },
    ),
  };
}

function createPage(command: {
  page: number;
  totalRows: number;
  totalPages: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  rowNumbers: number[];
}): GetOneStockBueItemsResponse {
  return {
    page: command.page,
    pageSize: 100,
    totalRows: command.totalRows,
    totalPages: command.totalPages,
    hasNextPage: command.hasNextPage ?? false,
    hasPreviousPage: command.hasPreviousPage ?? false,
    rows: command.rowNumbers.map((rowNumber) => ({
      rowNumber,
      data: {
        TLQV: `TLQV-${rowNumber}`,
      },
    })),
  };
}
