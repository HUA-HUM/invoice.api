import type { IGetAllStockBueItemsRepository } from '../../../../adapters/repositories/spreadsheet-api/stock-bue/IGetAllStockBueItemsRepository';
import type { IGetOneStockBueItemsRepository } from '../../../../adapters/repositories/spreadsheet-api/stock-bue/IGetOneStockBueItemsRepository';
import type {
  GetAllStockBueItemsCommand,
  GetAllStockBueItemsResponse,
  GetOneStockBueItemsResponse,
  StockBueItem,
} from '../../../../entities/spreadsheet-api/stock-bue/StockBueItems';

const DEFAULT_PAGE_SIZE = 100;
const MAXIMUM_PAGE_COUNT = 10_000;

export class StockBueSpreadsheetApiPaginationError extends Error {
  constructor(detail: string) {
    super(
      `Spreadsheet API returned inconsistent stock-bue pagination: ${detail}`,
    );
    this.name = StockBueSpreadsheetApiPaginationError.name;
  }
}

export class GetAllStockBueItemsRepository implements IGetAllStockBueItemsRepository {
  constructor(
    private readonly getOneStockBueItemsRepository: IGetOneStockBueItemsRepository,
  ) {}

  async getAll(
    command: GetAllStockBueItemsCommand = {},
  ): Promise<GetAllStockBueItemsResponse> {
    const pageSize = command.pageSize ?? DEFAULT_PAGE_SIZE;
    validatePositiveInteger(pageSize, 'pageSize');

    const rows: StockBueItem[] = [];
    const rowNumbers = new Set<number>();
    let currentPage = 1;
    let collectedPages = 0;

    while (true) {
      if (currentPage > MAXIMUM_PAGE_COUNT) {
        throw new StockBueSpreadsheetApiPaginationError(
          `page count exceeded the safety limit of ${MAXIMUM_PAGE_COUNT}`,
        );
      }

      const response = await this.getOneStockBueItemsRepository.getOne({
        page: currentPage,
        pageSize,
      });

      if (response.page !== currentPage) {
        throw new StockBueSpreadsheetApiPaginationError(
          `requested page ${currentPage}, received ${response.page}`,
        );
      }
      if (response.hasPreviousPage !== currentPage > 1) {
        throw new StockBueSpreadsheetApiPaginationError(
          `hasPreviousPage is invalid on page ${currentPage}`,
        );
      }

      validateStablePageSize(pageSize, response);
      appendUniqueRows(rows, rowNumbers, response);
      collectedPages = currentPage;

      if (!response.hasNextPage) {
        break;
      }

      currentPage += 1;
    }

    if (collectedPages === 0) {
      throw new StockBueSpreadsheetApiPaginationError(
        'the first page was not returned',
      );
    }

    return {
      pageSize,
      totalRows: rows.length,
      totalPages: collectedPages,
      rows,
    };
  }
}

function validateStablePageSize(
  requestedPageSize: number,
  currentPage: GetOneStockBueItemsResponse,
): void {
  if (currentPage.pageSize !== requestedPageSize) {
    throw new StockBueSpreadsheetApiPaginationError(
      'pageSize changed between pages',
    );
  }
}

function appendUniqueRows(
  target: StockBueItem[],
  rowNumbers: Set<number>,
  page: GetOneStockBueItemsResponse,
): void {
  for (const row of page.rows) {
    if (rowNumbers.has(row.rowNumber)) {
      continue;
    }
    rowNumbers.add(row.rowNumber);
    target.push(row);
  }
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}
