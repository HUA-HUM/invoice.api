import type { AxiosInstance } from 'axios';
import type { TlqvItemData } from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';
import {
  GetOneItemsRepository,
  SpreadsheetApiInvalidResponseError,
  SpreadsheetApiRequestError,
} from './GetOneItemsRepository';

describe('GetOneItemsRepository', () => {
  it('gets and validates one TLQV page', async () => {
    const get = jest.fn().mockResolvedValue({
      data: createPageResponse(),
    });
    const repository = new GetOneItemsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getOne({ page: 1, pageSize: 100 });

    expect(get).toHaveBeenCalledWith('/sheet/prueba-lectura/TLQV', {
      params: { page: 1, pageSize: 100 },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.data.TLQV).toBe('TLQV-1469');
  });

  it('rejects a response whose schema is invalid', async () => {
    const response = createPageResponse();
    response.rows[0].data.IVA = undefined as unknown as string;
    const get = jest.fn().mockResolvedValue({ data: response });
    const repository = new GetOneItemsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getOne({ page: 1, pageSize: 100 }),
    ).rejects.toBeInstanceOf(SpreadsheetApiInvalidResponseError);
  });

  it('does not leak the Axios error outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetOneItemsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(repository.getOne({ page: 1, pageSize: 100 })).rejects.toEqual(
      new SpreadsheetApiRequestError(1),
    );
  });
});

function createPageResponse() {
  return {
    page: 1,
    pageSize: 100,
    sheetName: 'TLQV',
    totalRows: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    rows: [
      {
        rowNumber: 2,
        data: createItemData(),
      },
    ],
  };
}

function createItemData(): TlqvItemData {
  return {
    TLQV: 'TLQV-1469',
    'Valor Declarado': '1.00',
    Peso: '1.00',
    PESOVOLUMENTICO: '1.39',
    VALORXKG: '11.71',
    DI: '',
    TE: '',
    IVA: '30295.65',
    'Total Impuestos': '26.23',
    'Total Flete': '16.27',
    'Fijo Liberacion': '13063.05',
    Seguro: '1.21',
    Total: '53.82',
    tc: '1155.00',
    tc2: '1155.00',
    'tc impuesto': '34991475.75',
    Productoco: '1155.00',
    'Productoco.b': '1155.00',
    DIFACTURA: '',
    'DIFACTURA.B': '',
    TEFACTURA: '',
    'TEFACTURA.B': '0.00',
    IVAFACTURA: '34991475.75',
    'IVAFACTURA.B': '34991475.75',
    LAFACTURA: '13063.05',
    'LAFACTURA.B': '15806.29',
    A13VENTA: '17.48',
    FLETEINTERNACIONALA: '-34585050.87',
    FLETEINTERNACIONALB: '-34585050.87',
    'NRO CARGA': '',
  };
}
