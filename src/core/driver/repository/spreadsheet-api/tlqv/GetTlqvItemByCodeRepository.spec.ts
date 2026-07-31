import type { AxiosInstance } from 'axios';
import type { TlqvItemData } from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';
import {
  GetTlqvItemByCodeRepository,
  SpreadsheetApiTlqvByCodeInvalidResponseError,
  SpreadsheetApiTlqvByCodeRequestError,
} from './GetTlqvItemByCodeRepository';

describe('GetTlqvItemByCodeRepository', () => {
  it('gets a TLQV sheet item by TLQV code', async () => {
    const get = jest.fn().mockResolvedValue({
      data: createTlqvItemResponse(),
    });
    const repository = new GetTlqvItemByCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByCode({ tlqvCode: 'tlqv-1569' });

    expect(get).toHaveBeenCalledWith('/sheet/prueba-lectura/TLQV/TLQV-1569');
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.item.rowNumber).toBe(22);
      expect(result.item.data.TLQV).toBe('TLQV-1569');
      expect(result.item.data['Imp Internos']).toBe('');
      expect(result.item.data.Productoco).toBe('198548.32');
    }
  });

  it('returns not_found when Spreadsheet API returns 404', async () => {
    const get = jest.fn().mockRejectedValue(createAxiosError(404));
    const repository = new GetTlqvItemByCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByCode({ tlqvCode: 'TLQV-1569' });

    expect(result).toEqual({
      found: false,
      tlqvCode: 'TLQV-1569',
      reason: 'not_found',
      rawPayload: { message: 'not found' },
    });
  });

  it('rejects a response for another TLQV', async () => {
    const response = createTlqvItemResponse();
    response.data.TLQV = 'TLQV-9999';
    const get = jest.fn().mockResolvedValue({
      data: response,
    });
    const repository = new GetTlqvItemByCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByCode({ tlqvCode: 'TLQV-1569' }),
    ).rejects.toBeInstanceOf(SpreadsheetApiTlqvByCodeInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetTlqvItemByCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByCode({ tlqvCode: 'TLQV-1569' }),
    ).rejects.toEqual(
      new SpreadsheetApiTlqvByCodeRequestError('TLQV-1569', 'network detail'),
    );
  });
});

function createTlqvItemResponse(): { rowNumber: number; data: TlqvItemData } {
  return {
    rowNumber: 22,
    data: {
      TLQV: 'TLQV-1569',
      'Valor Declarado': '169.99',
      Peso: '12.60',
      PESOVOLUMENTICO: '16.65',
      VALORXKG: '9.63',
      DI: '0.00',
      TE: '0.00',
      IVA: '42.74',
      'Imp Internos': '',
      'Anti Dumping': '',
      'Total Impuestos': '42.74',
      'Total Flete': '160.36',
      'Fijo Liberacion': '14082.40',
      Seguro: '1.70',
      Total: '215.23',
      tc: '1160.00',
      tc2: '1168.00',
      'tc impuesto': '49578.40',
      Productoco: '198548.32',
      'Productoco.b': '198548.32',
      DIFACTURA: '0.00',
      'DIFACTURA.B': '0.00',
      TEFACTURA: '0.00',
      'TEFACTURA.B': '0.00',
      IVAFACTURA: '49578.40',
      'IVAFACTURA.B': '49578.40',
      LAFACTURA: '14082.40',
      'LAFACTURA.B': '17039.70',
      A13VENTA: '162.06',
      FLETEINTERNACIONALA: '379294.29',
      FLETEINTERNACIONALB: '379294.29',
      'NRO CARGA': '',
    },
  };
}

function createAxiosError(status: number) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: {
      status,
      data: {
        message: status === 404 ? 'not found' : 'temporary error',
      },
    },
    toJSON: () => ({}),
  };
}
