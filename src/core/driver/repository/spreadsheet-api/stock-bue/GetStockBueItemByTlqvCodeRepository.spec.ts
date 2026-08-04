import {
  GetStockBueItemByTlqvCodeRepository,
  StockBueSpreadsheetApiByTlqvCodeRequestError,
} from './GetStockBueItemByTlqvCodeRepository';

describe('GetStockBueItemByTlqvCodeRepository', () => {
  it('gets one stock-bue item by TLQV code', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        rowNumber: 8921,
        data: {
          TLQV: 'TLQV-15239',
          'N venta': '2291-1',
          Instruccion: 'DESPACHADA',
        },
      },
    });
    const repository = new GetStockBueItemByTlqvCodeRepository({
      httpClient: { get } as never,
    });

    const result = await repository.getByTlqvCode({
      tlqvCode: ' tlqv-15239 ',
    });

    expect(get).toHaveBeenCalledWith('/sheet/stock-bue/TLQV-15239');
    expect(result).toEqual({
      found: true,
      tlqvCode: 'TLQV-15239',
      item: {
        rowNumber: 8921,
        data: {
          TLQV: 'TLQV-15239',
          'N venta': '2291-1',
          Instruccion: 'DESPACHADA',
        },
      },
    });
  });

  it('returns not_found when spreadsheet returns 404', async () => {
    const get = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: { message: 'not found' },
      },
    });
    const repository = new GetStockBueItemByTlqvCodeRepository({
      httpClient: { get } as never,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-15239' }),
    ).resolves.toEqual({
      found: false,
      tlqvCode: 'TLQV-15239',
      reason: 'not_found',
      rawPayload: { message: 'not found' },
    });
  });

  it('wraps request failures with context', async () => {
    const get = jest.fn().mockRejectedValue({
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded',
    });
    const repository = new GetStockBueItemByTlqvCodeRepository({
      httpClient: { get } as never,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-15239' }),
    ).rejects.toThrow(
      new StockBueSpreadsheetApiByTlqvCodeRequestError(
        'TLQV-15239',
        'ECONNABORTED - timeout of 10000ms exceeded',
      ),
    );
  });
});
