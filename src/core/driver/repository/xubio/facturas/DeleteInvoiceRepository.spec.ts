import type { AxiosInstance } from 'axios';
import {
  DeleteInvoiceRepository,
  XubioInvoiceDeleteRequestError,
} from './DeleteInvoiceRepository';

describe('DeleteInvoiceRepository', () => {
  it('deletes a Xubio invoice by transaction id', async () => {
    const deleteFn = jest.fn().mockResolvedValue({ data: '' });
    const repository = new DeleteInvoiceRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { delete: deleteFn } as unknown as AxiosInstance,
    });

    const result = await repository.delete({ transaccionId: 75226596 });

    expect(deleteFn).toHaveBeenCalledWith(
      '/API/1.1/comprobanteVentaBean/75226596',
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    );
    expect(result).toEqual({
      transaccionId: 75226596,
      deleted: true,
      rawPayload: '',
    });
  });

  it('rejects invalid transaction ids before calling Xubio', async () => {
    const deleteFn = jest.fn();
    const repository = new DeleteInvoiceRepository({
      httpClient: { delete: deleteFn } as unknown as AxiosInstance,
    });

    await expect(
      repository.delete({ transaccionId: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('does not leak Axios errors outside the driver', async () => {
    const deleteFn = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new DeleteInvoiceRepository({
      httpClient: { delete: deleteFn } as unknown as AxiosInstance,
    });

    await expect(
      repository.delete({ transaccionId: 75226596 }),
    ).rejects.toEqual(
      new XubioInvoiceDeleteRequestError(75226596, 'network detail'),
    );
  });

  it('wraps Xubio HTTP errors with status and body', async () => {
    const deleteFn = jest.fn().mockRejectedValue(createAxiosError(400));
    const repository = new DeleteInvoiceRepository({
      httpClient: { delete: deleteFn } as unknown as AxiosInstance,
    });

    await expect(
      repository.delete({ transaccionId: 75226596 }),
    ).rejects.toEqual(
      new XubioInvoiceDeleteRequestError(
        75226596,
        'HTTP 400 - {"message":"cannot delete invoice"}',
      ),
    );
  });

  it('refreshes the token and retries after an authorization failure', async () => {
    const deleteFn = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(401))
      .mockResolvedValueOnce({ data: '' });
    const accessTokenProvider = jest
      .fn()
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2');
    const onAuthorizationFailure = jest.fn();
    const repository = new DeleteInvoiceRepository({
      httpClient: { delete: deleteFn } as unknown as AxiosInstance,
      accessTokenProvider,
      onAuthorizationFailure,
      retryOptions: {
        maxAttempts: 2,
        initialDelayInMilliseconds: 0,
        maxDelayInMilliseconds: 0,
      },
    });

    const result = await repository.delete({ transaccionId: 75226596 });

    expect(result.deleted).toBe(true);
    expect(onAuthorizationFailure).toHaveBeenCalledTimes(1);
    expect(accessTokenProvider).toHaveBeenCalledTimes(2);
    expect(deleteFn).toHaveBeenNthCalledWith(
      1,
      '/API/1.1/comprobanteVentaBean/75226596',
      {
        headers: {
          Authorization: 'Bearer token-1',
        },
      },
    );
    expect(deleteFn).toHaveBeenNthCalledWith(
      2,
      '/API/1.1/comprobanteVentaBean/75226596',
      {
        headers: {
          Authorization: 'Bearer token-2',
        },
      },
    );
  });
});

function createAxiosError(status: number) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: {
      status,
      data: {
        message: status === 400 ? 'cannot delete invoice' : 'temporary error',
      },
    },
    toJSON: () => ({}),
  };
}
