import type { IGetAccessTokenRepository } from '../../../../adapters/repositories/xubio/auth/IGetAccessTokenRepository';

const DEFAULT_EXPIRATION_SAFETY_MARGIN_IN_MILLISECONDS = 60_000;

export interface CachedXubioAccessTokenProviderOptions {
  expirationSafetyMarginInMilliseconds?: number;
  now?: () => number;
}

export class CachedXubioAccessTokenProvider {
  private accessToken: string | null = null;
  private expiresAt: number | null = null;
  private readonly expirationSafetyMarginInMilliseconds: number;
  private readonly now: () => number;

  constructor(
    private readonly getAccessTokenRepository: IGetAccessTokenRepository,
    options: CachedXubioAccessTokenProviderOptions = {},
  ) {
    this.expirationSafetyMarginInMilliseconds =
      options.expirationSafetyMarginInMilliseconds ??
      DEFAULT_EXPIRATION_SAFETY_MARGIN_IN_MILLISECONDS;
    this.now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken !== null && !this.isExpired()) {
      return this.accessToken;
    }

    const response = await this.getAccessTokenRepository.getAccessToken();
    this.accessToken = response.accessToken;
    this.expiresAt =
      response.expiresIn === null
        ? null
        : this.now() + response.expiresIn * 1000;

    return this.accessToken;
  }

  invalidateAccessToken(): void {
    this.accessToken = null;
    this.expiresAt = null;
  }

  private isExpired(): boolean {
    if (this.expiresAt === null) {
      return false;
    }

    return (
      this.now() + this.expirationSafetyMarginInMilliseconds >= this.expiresAt
    );
  }
}
