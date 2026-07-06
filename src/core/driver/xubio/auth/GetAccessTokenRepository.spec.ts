import type { AxiosInstance } from 'axios';
import {
  GetAccessTokenRepository,
  XubioAccessTokenInvalidResponseError,
  XubioAccessTokenRequestError,
} from './GetAccessTokenRepository';

describe('GetAccessTokenRepository', () => {
  it('gets a Xubio access token with client credentials', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      },
    });
    const repository = new GetAccessTokenRepository({
      basicAuthorizationToken: 'basic-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.getAccessToken();

    expect(post).toHaveBeenCalledWith(
      '/API/1.1/TokenEndpoint',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic basic-token',
        },
      },
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.expiresIn).toBe(3600);
  });

  it('does not duplicate Basic prefix when provided', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        access_token: 'access-token',
      },
    });
    const repository = new GetAccessTokenRepository({
      basicAuthorizationToken: 'Basic already-prefixed-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    await repository.getAccessToken();

    const call = post.mock.calls[0] as [
      string,
      string,
      { headers: { Authorization: string } },
    ];
    expect(call[2].headers.Authorization).toBe('Basic already-prefixed-token');
  });

  it('rejects invalid token responses', async () => {
    const post = jest
      .fn()
      .mockResolvedValue({ data: { token_type: 'Bearer' } });
    const repository = new GetAccessTokenRepository({
      basicAuthorizationToken: 'basic-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(repository.getAccessToken()).rejects.toBeInstanceOf(
      XubioAccessTokenInvalidResponseError,
    );
  });

  it('accepts expires_in as numeric string', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        access_token: 'access-token',
        expires_in: '3600',
      },
    });
    const repository = new GetAccessTokenRepository({
      basicAuthorizationToken: 'basic-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.getAccessToken();

    expect(result.expiresIn).toBe(3600);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const post = jest.fn().mockRejectedValue(new Error('raw network error'));
    const repository = new GetAccessTokenRepository({
      basicAuthorizationToken: 'basic-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(repository.getAccessToken()).rejects.toEqual(
      new XubioAccessTokenRequestError('raw network error'),
    );
  });

  it('retries transient Xubio token errors', async () => {
    const post = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValueOnce({
        data: {
          access_token: 'access-token',
        },
      });
    const repository = new GetAccessTokenRepository({
      basicAuthorizationToken: 'basic-token',
      httpClient: { post } as unknown as AxiosInstance,
      retryOptions: {
        maxAttempts: 2,
        initialDelayInMilliseconds: 0,
        maxDelayInMilliseconds: 0,
      },
    });

    const result = await repository.getAccessToken();

    expect(result.accessToken).toBe('access-token');
    expect(post).toHaveBeenCalledTimes(2);
  });
});

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
