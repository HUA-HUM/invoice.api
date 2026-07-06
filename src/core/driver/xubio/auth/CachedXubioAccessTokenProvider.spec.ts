import type { IGetAccessTokenRepository } from '../../../adapters/repositories/xubio/auth/IGetAccessTokenRepository';
import { CachedXubioAccessTokenProvider } from './CachedXubioAccessTokenProvider';

describe('CachedXubioAccessTokenProvider', () => {
  it('reuses a token while it is still valid', async () => {
    const repository = createRepositoryMock();
    repository.getAccessToken.mockResolvedValue({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      expiresIn: 3600,
      rawPayload: {},
    });
    const provider = new CachedXubioAccessTokenProvider(repository, {
      now: () => 1_000,
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-1');
    await expect(provider.getAccessToken()).resolves.toBe('token-1');

    expect(repository.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes a token when it is expired', async () => {
    let now = 1_000;
    const repository = createRepositoryMock();
    repository.getAccessToken
      .mockResolvedValueOnce({
        accessToken: 'token-1',
        tokenType: 'Bearer',
        expiresIn: 1,
        rawPayload: {},
      })
      .mockResolvedValueOnce({
        accessToken: 'token-2',
        tokenType: 'Bearer',
        expiresIn: 1,
        rawPayload: {},
      });
    const provider = new CachedXubioAccessTokenProvider(repository, {
      expirationSafetyMarginInMilliseconds: 0,
      now: () => now,
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-1');
    now = 2_001;
    await expect(provider.getAccessToken()).resolves.toBe('token-2');

    expect(repository.getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('refreshes a token after invalidation', async () => {
    const repository = createRepositoryMock();
    repository.getAccessToken
      .mockResolvedValueOnce({
        accessToken: 'token-1',
        tokenType: 'Bearer',
        expiresIn: 3600,
        rawPayload: {},
      })
      .mockResolvedValueOnce({
        accessToken: 'token-2',
        tokenType: 'Bearer',
        expiresIn: 3600,
        rawPayload: {},
      });
    const provider = new CachedXubioAccessTokenProvider(repository, {
      now: () => 1_000,
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-1');
    provider.invalidateAccessToken();
    await expect(provider.getAccessToken()).resolves.toBe('token-2');

    expect(repository.getAccessToken).toHaveBeenCalledTimes(2);
  });
});

function createRepositoryMock() {
  return {
    getAccessToken: jest.fn(),
  } as unknown as IGetAccessTokenRepository & {
    getAccessToken: jest.Mock;
  };
}
