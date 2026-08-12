import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';

function fakeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as any;
}

const CONFIG = fakeConfig({
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_MFA_SETUP_SECRET: 'mfa-setup-secret',
  JWT_MFA_SETUP_EXPIRES_IN: '10m',
  JWT_MFA_CHALLENGE_SECRET: 'mfa-challenge-secret',
  JWT_MFA_CHALLENGE_EXPIRES_IN: '5m',
});

describe('TokenService', () => {
  const service = new TokenService(new JwtService(), CONFIG);

  it('signs and verifies a round trip for each token type', () => {
    const access = service.sign({ sub: 'user-1', type: 'access' });
    expect(service.verify(access, 'access').sub).toBe('user-1');

    const mfaSetup = service.sign({ sub: 'user-1', type: 'mfa_setup' });
    expect(service.verify(mfaSetup, 'mfa_setup').sub).toBe('user-1');
  });

  it('rejects a token verified against the wrong type — even with a valid signature', () => {
    // Signé avec le secret "access" mais on essaie de le faire passer pour un refresh token :
    // doit échouer, sinon un jeton d'accès volé pourrait être rejoué comme refresh token.
    const access = service.sign({ sub: 'user-1', type: 'access' });
    expect(() => service.verify(access, 'refresh')).toThrow(UnauthorizedException);
  });

  it('rejects a tampered or garbage token', () => {
    expect(() => service.verify('not-a-jwt', 'access')).toThrow(UnauthorizedException);
  });

  it('computes the refresh cookie lifetime from JWT_REFRESH_EXPIRES_IN', () => {
    expect(service.refreshExpiresInMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
