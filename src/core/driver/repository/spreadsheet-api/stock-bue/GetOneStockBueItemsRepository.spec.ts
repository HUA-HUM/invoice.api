import type { AxiosInstance } from 'axios';
import {
  GetOneStockBueItemsRepository,
  StockBueSpreadsheetApiRequestError,
} from './GetOneStockBueItemsRepository';

describe('GetOneStockBueItemsRepository', () => {
  it('retries transient request failures', async () => {
    const { httpClient, getMock } = createHttpClientMock([
      Promise.reject(new Error('temporary spreadsheet outage')),
      Promise.resolve({
        data: createResponseBody(),
      }),
    ]);
    const repository = new GetOneStockBueItemsRepository({
      httpClient,
      requestAttempts: 2,
      retryDelayInMilliseconds: 0,
    });

    await expect(
      repository.getOne({ page: 1, pageSize: 100 }),
    ).resolves.toMatchObject({
      page: 1,
      pageSize: 100,
      totalRows: 1,
      rows: [{ rowNumber: 2, data: { TLQV: 'TLQV-562' } }],
    });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('includes request error details after exhausting attempts', async () => {
    const { httpClient } = createHttpClientMock([
      Promise.reject(
        createAxiosError({
          status: 503,
          data: {
            message: 'Spreadsheet unavailable',
          },
        }),
      ),
      Promise.reject(
        createAxiosError({
          status: 503,
          data: {
            message: 'Spreadsheet unavailable',
          },
        }),
      ),
    ]);
    const repository = new GetOneStockBueItemsRepository({
      httpClient,
      requestAttempts: 1,
      retryDelayInMilliseconds: 0,
    });

    await expect(repository.getOne({ page: 1, pageSize: 100 })).rejects.toThrow(
      'Spreadsheet API request failed for stock-bue page 1: HTTP 503 - {"message":"Spreadsheet unavailable"}',
    );
    await expect(repository.getOne({ page: 1, pageSize: 100 })).rejects.toThrow(
      StockBueSpreadsheetApiRequestError,
    );
  });
});

function createAxiosError(command: { status: number; data: unknown }): Error & {
  isAxiosError: true;
  response: {
    status: number;
    data: unknown;
  };
} {
  const error = new Error('Request failed') as Error & {
    isAxiosError: true;
    response: {
      status: number;
      data: unknown;
    };
  };

  error.isAxiosError = true;
  error.response = {
    status: command.status,
    data: command.data,
  };

  return error;
}

function createHttpClientMock(responses: Promise<{ data: unknown }>[]): {
  httpClient: AxiosInstance;
  getMock: jest.Mock<Promise<{ data: unknown }>, []>;
} {
  const getMock = jest.fn<Promise<{ data: unknown }>, []>(() => {
    const response = responses.shift();
    if (response === undefined) {
      return Promise.reject(new Error('Unexpected request'));
    }

    return response;
  });

  return {
    httpClient: {
      get: getMock,
    } as unknown as AxiosInstance,
    getMock,
  };
}

function createResponseBody(): unknown {
  return {
    page: 1,
    pageSize: 100,
    totalRows: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    rows: [
      {
        rowNumber: 2,
        data: {
          TLQV: 'TLQV-562',
        },
      },
    ],
  };
}
