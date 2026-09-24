import { executeSpreadsheetApiRequestWithRetry } from './SpreadsheetApiRequestRetry';

const NO_DELAY = {
  maxAttempts: 3,
  initialDelayInMilliseconds: 0,
  maxDelayInMilliseconds: 0,
};

describe('executeSpreadsheetApiRequestWithRetry', () => {
  it('retries a timeout, which is the whole point', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(createTimeoutError())
      .mockResolvedValueOnce('row');

    await expect(
      executeSpreadsheetApiRequestWithRetry(operation, NO_DELAY),
    ).resolves.toBe('row');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured attempts and throws the last error', async () => {
    const error = createTimeoutError();
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      executeSpreadsheetApiRequestWithRetry(operation, NO_DELAY),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it.each([408, 429, 500, 502, 504])('retries HTTP %i', async (status) => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(status))
      .mockResolvedValueOnce('row');

    await expect(
      executeSpreadsheetApiRequestWithRetry(operation, NO_DELAY),
    ).resolves.toBe('row');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404, which means the row is not in the sheet', async () => {
    const error = createAxiosError(404);
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      executeSpreadsheetApiRequestWithRetry(operation, NO_DELAY),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry an error that is not an HTTP failure', async () => {
    const error = new RangeError('tlqvCode is required');
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      executeSpreadsheetApiRequestWithRetry(operation, NO_DELAY),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rejects a nonsense attempt count instead of looping forever', async () => {
    await expect(
      executeSpreadsheetApiRequestWithRetry(jest.fn(), { maxAttempts: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

function createTimeoutError() {
  return {
    isAxiosError: true,
    code: 'ECONNABORTED',
    message: 'timeout of 10000ms exceeded',
    toJSON: () => ({}),
  };
}

function createAxiosError(status: number) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: { status, data: { message: 'error' } },
    toJSON: () => ({}),
  };
}
