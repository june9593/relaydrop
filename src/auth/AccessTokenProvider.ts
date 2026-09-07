export interface AccessTokenRequest {
  forceRefresh?: boolean;
}

export type AccessTokenProvider = (
  request?: AccessTokenRequest
) => Promise<string>;
