export interface GetXubioAccessTokenCommand {
  grantType?: 'client_credentials';
}

export interface GetXubioAccessTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number | null;
  rawPayload: unknown;
}
