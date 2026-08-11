export type TokenType = 'access' | 'refresh' | 'mfa_setup' | 'mfa_challenge';

export interface JwtPayload {
  sub: string;
  type: TokenType;
  jti?: string;
  family?: string;
}
