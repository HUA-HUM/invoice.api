import { executeXubioRequestWithRetry } from './XubioRequestRetry';

const NO_DELAY = {
  maxAttempts: 4,
  initialDelayInMilliseconds: 0,
  maxDelayInMilliseconds: 0,
};

describe('executeXubioRequestWithRetry', () => {
  it('retries a timeout by default, because reads can be repeated safely', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(createNetworkError())
      .mockResolvedValueOnce('ok');

    await expect(
      executeXubioRequestWithRetry(operation, NO_DELAY),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a timeout when the outcome must stay indeterminate', async () => {
    const error = createNetworkError();
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      executeXubioRequestWithRetry(operation, {
        ...NO_DELAY,
        retryOnIndeterminateOutcome: false,
      }),
    ).rejects.toBe(error);
    // Xubio may have created the comprobante before the answer got lost.
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([408, 500, 502, 504])(
    'does not retry HTTP %i when the outcome must stay indeterminate',
    async (status) => {
      const error = createAxiosError(status);
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        executeXubioRequestWithRetry(operation, {
          ...NO_DELAY,
          retryOnIndeterminateOutcome: false,
        }),
      ).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it('still retries a 429, which Xubio rejects before processing anything', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(429))
      .mockResolvedValueOnce('ok');

    await expect(
      executeXubioRequestWithRetry(operation, {
        ...NO_DELAY,
        retryOnIndeterminateOutcome: false,
      }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('still refreshes the token and retries a 401, which never reached the invoice', async () => {
    const onAuthorizationFailure = jest.fn();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(401))
      .mockResolvedValueOnce('ok');

    await expect(
      executeXubioRequestWithRetry(operation, {
        ...NO_DELAY,
        retryOnIndeterminateOutcome: false,
        onAuthorizationFailure,
      }),
    ).resolves.toBe('ok');
    expect(onAuthorizationFailure).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx by default', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(503))
      .mockResolvedValueOnce('ok');

    await expect(
      executeXubioRequestWithRetry(operation, NO_DELAY),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('never retries a 400, whichever the setting', async () => {
    const error = createAxiosError(400);
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      executeXubioRequestWithRetry(operation, NO_DELAY),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

function createNetworkError() {
  return {
    isAxiosError: true,
    code: 'ECONNABORTED',
    message: 'timeout of 30000ms exceeded',
    toJSON: () => ({}),
  };
}

function createAxiosError(status: number) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: {
      status,
      data: {
        message: 'temporary Xubio error',
      },
    },
    toJSON: () => ({}),
  };
}
