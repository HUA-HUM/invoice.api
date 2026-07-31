import type { AxiosInstance } from 'axios';
import {
  GetMadreItemByTlqvCodeRepository,
  SpreadsheetApiMadreByTlqvInvalidResponseError,
  SpreadsheetApiMadreByTlqvRequestError,
} from './GetMadreItemByTlqvCodeRepository';

describe('GetMadreItemByTlqvCodeRepository', () => {
  it('gets a MADRE sheet item by TLQV code', async () => {
    const get = jest.fn().mockResolvedValue({
      data: createMadreItemResponse(),
    });
    const repository = new GetMadreItemByTlqvCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByTlqvCode({ tlqvCode: 'tlqv-1569' });

    expect(get).toHaveBeenCalledWith('/sheet/prueba-lectura/MADRE/TLQV-1569');
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.item.rowNumber).toBe(1526);
      expect(result.item.data.Identificador).toBe('TLQV-1569');
      expect(result.item.data.NROVENTA).toBe('2000007867251585');
      expect(result.item.data.PRECIOVENTA).toBe('$781,999.10');
    }
  });

  it('accepts link cells as arrays of strings', async () => {
    const response = createMadreItemResponse();
    response.data.LINKML = ['https://www.mercadolibre.com.ar/ventas/1'];
    response.data.LINKAMAZON = ['https://www.amazon.com/dp/B0CT4N5WZB'];
    const get = jest.fn().mockResolvedValue({
      data: response,
    });
    const repository = new GetMadreItemByTlqvCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByTlqvCode({ tlqvCode: 'TLQV-1569' });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.item.data.LINKML).toEqual([
        'https://www.mercadolibre.com.ar/ventas/1',
      ]);
    }
  });

  it('returns not_found when Spreadsheet API returns 404', async () => {
    const get = jest.fn().mockRejectedValue(createAxiosError(404));
    const repository = new GetMadreItemByTlqvCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByTlqvCode({ tlqvCode: 'TLQV-1569' });

    expect(result).toEqual({
      found: false,
      tlqvCode: 'TLQV-1569',
      reason: 'not_found',
      rawPayload: { message: 'not found' },
    });
  });

  it('rejects a response for another TLQV', async () => {
    const response = createMadreItemResponse();
    response.data.Identificador = 'TLQV-9999';
    const get = jest.fn().mockResolvedValue({
      data: response,
    });
    const repository = new GetMadreItemByTlqvCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-1569' }),
    ).rejects.toBeInstanceOf(SpreadsheetApiMadreByTlqvInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetMadreItemByTlqvCodeRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-1569' }),
    ).rejects.toEqual(
      new SpreadsheetApiMadreByTlqvRequestError('TLQV-1569', 'network detail'),
    );
  });
});

function createMadreItemResponse() {
  return {
    rowNumber: 1526,
    data: {
      Identificador: 'TLQV-1569',
      'Nombre de Tarea': 'Informar fecha de acreditacion',
      FECHAAMAZON: '2025/05/16',
      FECHACOMPRA: '2025/05/13',
      FECHAENTREGA: '2025/05/29',
      FECHAVENTA: '2025/05/13',
      NROGUIA: '19052025',
      NROVENTA: '2000007867251585',
      TRANSFORMADOR: 'NO',
      NOMBREPRODUCTO: 'Tabla De Remo Inflable con su kit de accesorios',
      LINKML: 'https://www.mercadolibre.com.ar/ventas/2000007867251585/detalle',
      ESTADO: 'FACTURADA',
      ESTADOENVIO: '',
      ETD: '2025/05/21',
      OBSOPERACIONES: '',
      TIPOVENTA: 'ML',
      LINKAMAZON: 'https://www.amazon.com/-/es/dp/B0CT4N5WZB',
      NPEDIDOAMZ: '112-7059218-9728213',
      PESOPRODUCTO: '12.000',
      'Tracking amazon': '',
      'Cantidad de Unidades': '1',
      'CANTIDAD DE BULTOS': '1',
      PRECIOVENTA: '$781,999.10',
      SALDOML: '$628,038.80',
      COMISIONML: '$121,209.90',
      COSTOENVIO: '$16,328.49',
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
