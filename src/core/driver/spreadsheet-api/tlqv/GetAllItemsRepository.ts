import type { IGetAllItemsRepository } from '../../../adapters/repositories/spreadsheet-api/tlqv/IGetAllItemsRepository';
import type { IGetOneItemsRepository } from '../../../adapters/repositories/spreadsheet-api/tlqv/IGetOneItemsRepository';
import type {
  GetAllTlqvItemsCommand,
  GetAllTlqvItemsResponse,
  GetOneTlqvItemsResponse,
  TlqvItem,
} from '../../../entities/spreadsheet-api/tlqv/TlqvItems';

const DEFAULT_PAGE_SIZE = 100;
const MAXIMUM_PAGE_COUNT = 10_000;

export class SpreadsheetApiPaginationError extends Error {
  constructor(detail: string) {
    super(`Spreadsheet API returned inconsistent TLQV pagination: ${detail}`);
    this.name = SpreadsheetApiPaginationError.name;
  }
}

export class GetAllItemsRepository implements IGetAllItemsRepository {
  constructor(private readonly getOneItemsRepository: IGetOneItemsRepository) {}

  async getAll(
    command: GetAllTlqvItemsCommand = {},
  ): Promise<GetAllTlqvItemsResponse> {
    const pageSize = command.pageSize ?? DEFAULT_PAGE_SIZE;
    validatePositiveInteger(pageSize, 'pageSize');

    const rows: TlqvItem[] = [];
    const rowNumbers = new Set<number>();
    let currentPage = 1;
    let firstPage: GetOneTlqvItemsResponse | undefined;

    while (true) {
      if (currentPage > MAXIMUM_PAGE_COUNT) {
        throw new SpreadsheetApiPaginationError(
          `page count exceeded the safety limit of ${MAXIMUM_PAGE_COUNT}`,
        );
      }

      const response = await this.getOneItemsRepository.getOne({
        page: currentPage,
        pageSize,
      });

      if (response.page !== currentPage) {
        throw new SpreadsheetApiPaginationError(
          `requested page ${currentPage}, received ${response.page}`,
        );
      }
      if (response.hasPreviousPage !== currentPage > 1) {
        throw new SpreadsheetApiPaginationError(
          `hasPreviousPage is invalid on page ${currentPage}`,
        );
      }

      if (firstPage === undefined) {
        firstPage = response;
      } else {
        validateStableMetadata(firstPage, response);
      }

      appendUniqueRows(rows, rowNumbers, response);

      if (!response.hasNextPage) {
        break;
      }
      if (currentPage >= response.totalPages) {
        throw new SpreadsheetApiPaginationError(
          `page ${currentPage} hasNextPage but totalPages is ${response.totalPages}`,
        );
      }

      currentPage += 1;
    }

    if (firstPage === undefined) {
      throw new SpreadsheetApiPaginationError(
        'the first page was not returned',
      );
    }
    if (rows.length !== firstPage.totalRows) {
      throw new SpreadsheetApiPaginationError(
        `expected ${firstPage.totalRows} rows, collected ${rows.length}`,
      );
    }

    return {
      pageSize,
      sheetName: firstPage.sheetName,
      totalRows: firstPage.totalRows,
      totalPages: firstPage.totalPages,
      rows,
    };
  }
}

function validateStableMetadata(
  firstPage: GetOneTlqvItemsResponse,
  currentPage: GetOneTlqvItemsResponse,
): void {
  if (currentPage.sheetName !== firstPage.sheetName) {
    throw new SpreadsheetApiPaginationError('sheetName changed between pages');
  }
  if (currentPage.pageSize !== firstPage.pageSize) {
    throw new SpreadsheetApiPaginationError('pageSize changed between pages');
  }
  if (currentPage.totalRows !== firstPage.totalRows) {
    throw new SpreadsheetApiPaginationError('totalRows changed between pages');
  }
  if (currentPage.totalPages !== firstPage.totalPages) {
    throw new SpreadsheetApiPaginationError('totalPages changed between pages');
  }
}

function appendUniqueRows(
  target: TlqvItem[],
  rowNumbers: Set<number>,
  page: GetOneTlqvItemsResponse,
): void {
  for (const row of page.rows) {
    if (rowNumbers.has(row.rowNumber)) {
      throw new SpreadsheetApiPaginationError(
        `rowNumber ${row.rowNumber} was returned more than once`,
      );
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
