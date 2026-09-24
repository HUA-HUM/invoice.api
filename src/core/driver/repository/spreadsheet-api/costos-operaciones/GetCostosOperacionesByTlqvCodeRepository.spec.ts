import {
  CostosOperacionesSpreadsheetApiByTlqvCodeRequestError,
  GetCostosOperacionesByTlqvCodeRepository,
} from './GetCostosOperacionesByTlqvCodeRepository';

describe('GetCostosOperacionesByTlqvCodeRepository', () => {
  it('gets one costos-operaciones item by TLQV code', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        rowNumber: 17648,
        data: {
          OPERACIÓN: 'TLQV-17767',
          Producto:
            'LaserPair 755/808/1064nm Laser Safety Glasses for laser technicians',
          'Fecha Venta': '12/8/2026',
          PESO: '0.22',
          'TC AMCO': '$1,515.00',
          'TC TLQ': '$1,583.00',
          'Precio de venta - Costo Cuotas': '$156,466.80',
          'Precio de venta': '$156,466.80',
          'Costo cuotas': '$0.00',
          'Aporte ML': '',
          'COMISION MP': '$3,388.91',
          'ENVIO ML': '$10,000.00',
          'Nro de Venta': '3052-1',
          ESTADO: 'CANCELADA',
          CUIT: '2724688698',
        },
      },
    });
    const repository = new GetCostosOperacionesByTlqvCodeRepository({
      httpClient: { get } as never,
    });

    const result = await repository.getByTlqvCode({
      tlqvCode: ' tlqv-17767 ',
    });

    expect(get).toHaveBeenCalledWith('/sheet/costos-operaciones/TLQV-17767');
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.item.rowNumber).toBe(17648);
      expect(result.item.data['Precio de venta']).toBe('$156,466.80');
      expect(result.item.data['Nro de Venta']).toBe('3052-1');
    }
  });

  it('returns not_found when spreadsheet returns 404', async () => {
    const get = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: { message: 'not found' },
      },
    });
    const repository = new GetCostosOperacionesByTlqvCodeRepository({
      httpClient: { get } as never,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-17767' }),
    ).resolves.toEqual({
      found: false,
      tlqvCode: 'TLQV-17767',
      reason: 'not_found',
      rawPayload: { message: 'not found' },
    });
  });

  it('wraps request failures with context once the retries are spent', async () => {
    const get = jest.fn().mockRejectedValue(createTimeoutError());
    const repository = new GetCostosOperacionesByTlqvCodeRepository({
      httpClient: { get } as never,
      retryOptions: NO_DELAY_RETRY,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-17767' }),
    ).rejects.toThrow(
      new CostosOperacionesSpreadsheetApiByTlqvCodeRequestError(
        'TLQV-17767',
        'ECONNABORTED - timeout of 10000ms exceeded',
      ),
    );
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('recovers from a timeout on its own, so a single TLQV can be invoiced (TLQV-19368)', async () => {
    // The sheet read timed out once and blocked the whole invoice, because a
    // single run has no second chance the way the bulk queue does.
    const get = jest
      .fn()
      .mockRejectedValueOnce(createTimeoutError())
      .mockResolvedValueOnce({
        data: {
          rowNumber: 17648,
          data: { OPERACIÓN: 'TLQV-19368', 'Precio de venta': '$902,999.00' },
        },
      });
    const repository = new GetCostosOperacionesByTlqvCodeRepository({
      httpClient: { get } as never,
      retryOptions: NO_DELAY_RETRY,
    });

    const result = await repository.getByTlqvCode({ tlqvCode: 'TLQV-19368' });

    expect(result.found).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404, which simply means the row is not in the sheet', async () => {
    const get = jest.fn().mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 404',
      response: { status: 404, data: { message: 'not found' } },
    });
    const repository = new GetCostosOperacionesByTlqvCodeRepository({
      httpClient: { get } as never,
      retryOptions: NO_DELAY_RETRY,
    });

    const result = await repository.getByTlqvCode({ tlqvCode: 'TLQV-17767' });

    expect(result.found).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('rejects a response for another TLQV', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        rowNumber: 1,
        data: { OPERACIÓN: 'TLQV-9999' },
      },
    });
    const repository = new GetCostosOperacionesByTlqvCodeRepository({
      httpClient: { get } as never,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-17767' }),
    ).rejects.toThrow('expected TLQV TLQV-17767, received TLQV-9999');
  });
});

const NO_DELAY_RETRY = {
  maxAttempts: 3,
  initialDelayInMilliseconds: 0,
  maxDelayInMilliseconds: 0,
};

function createTimeoutError() {
  return {
    isAxiosError: true,
    code: 'ECONNABORTED',
    message: 'timeout of 10000ms exceeded',
  };
}
