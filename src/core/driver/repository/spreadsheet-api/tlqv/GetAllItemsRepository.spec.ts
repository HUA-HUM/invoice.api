import type { IGetOneItemsRepository } from '../../../../adapters/repositories/spreadsheet-api/tlqv/IGetOneItemsRepository';
import type {
  GetOneTlqvItemsCommand,
  GetOneTlqvItemsResponse,
  TlqvItem,
} from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';
import {
  GetAllItemsRepository,
  SpreadsheetApiPaginationError,
} from './GetAllItemsRepository';

describe('GetAllItemsRepository', () => {
  it('iterates over every page and returns all rows', async () => {
    const getOne = jest.fn(
      (command: GetOneTlqvItemsCommand): Promise<GetOneTlqvItemsResponse> => {
        if (command.page === 1) {
          return Promise.resolve(createPage(1, true, [createItem(2)]));
        }
        if (command.page === 2) {
          return Promise.resolve(createPage(2, false, [createItem(3)]));
        }
        return Promise.reject(new Error('Unexpected page'));
      },
    );
    const onePageRepository: IGetOneItemsRepository = { getOne };
    const repository = new GetAllItemsRepository(onePageRepository);

    const result = await repository.getAll({ pageSize: 1 });

    expect(getOne).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 1 });
    expect(getOne).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 1 });
    expect(result.totalRows).toBe(2);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
  });

  it('rejects duplicated rows returned by different pages', async () => {
    const getOne = jest.fn(
      (command: GetOneTlqvItemsCommand): Promise<GetOneTlqvItemsResponse> =>
        Promise.resolve(
          command.page === 1
            ? createPage(1, true, [createItem(2)])
            : createPage(2, false, [createItem(2)]),
        ),
    );
    const repository = new GetAllItemsRepository({ getOne });

    await expect(repository.getAll({ pageSize: 1 })).rejects.toBeInstanceOf(
      SpreadsheetApiPaginationError,
    );
  });
});

function createPage(
  page: number,
  hasNextPage: boolean,
  rows: TlqvItem[],
): GetOneTlqvItemsResponse {
  return {
    page,
    pageSize: 1,
    sheetName: 'TLQV',
    totalRows: 2,
    totalPages: 2,
    hasNextPage,
    hasPreviousPage: page > 1,
    rows,
  };
}

function createItem(rowNumber: number): TlqvItem {
  return {
    rowNumber,
    data: {
      TLQV: `TLQV-${rowNumber}`,
      'Valor Declarado': '',
      Peso: '',
      PESOVOLUMENTICO: '',
      VALORXKG: '',
      DI: '',
      TE: '',
      IVA: '',
      'Total Impuestos': '',
      'Total Flete': '',
      'Fijo Liberacion': '',
      Seguro: '',
      Total: '',
      tc: '',
      tc2: '',
      'tc impuesto': '',
      Productoco: '',
      'Productoco.b': '',
      DIFACTURA: '',
      'DIFACTURA.B': '',
      TEFACTURA: '',
      'TEFACTURA.B': '',
      IVAFACTURA: '',
      'IVAFACTURA.B': '',
      LAFACTURA: '',
      'LAFACTURA.B': '',
      A13VENTA: '',
      FLETEINTERNACIONALA: '',
      FLETEINTERNACIONALB: '',
      'NRO CARGA': '',
    },
  };
}
