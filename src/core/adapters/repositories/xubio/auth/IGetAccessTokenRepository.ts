import type {
  GetXubioAccessTokenCommand,
  GetXubioAccessTokenResponse,
} from '../../../../entities/xubio/auth/XubioToken';

export interface IGetAccessTokenRepository {
  getAccessToken(
    command?: GetXubioAccessTokenCommand,
  ): Promise<GetXubioAccessTokenResponse>;
}
