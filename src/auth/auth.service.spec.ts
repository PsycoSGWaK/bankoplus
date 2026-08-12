import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordService } from './services/password.service';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';
import { EncryptionService } from '../common/crypto/encryption.service';

function fakeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_MFA_SETUP_SECRET: 'mfa-setup-secret',
    JWT_MFA_CHALLENGE_SECRET: 'mfa-challenge-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    MFA_SECRET_ENCRYPTION_KEY: '0'.repeat(64),
    MFA_ISSUER: 'Banko+ Test',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as any;
}

function repoMock() {
  return {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(),
    create: jest.fn((x) => x),
    update: jest.fn(),
  };
}

describe('AuthService', () => {
  let auth: AuthService;
  let users: ReturnType<typeof repoMock>;
  let refreshTokens: ReturnType<typeof repoMock>;

  beforeEach(async () => {
    users = repoMock();
    refreshTokens = repoMock();

    const config = fakeConfig();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        MfaService,
        EncryptionService,
        { provide: TokenService, useValue: new TokenService(new JwtService(), config) },
        { provide: ConfigService, useValue: config },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
      ],
    }).compile();

    auth = module.get(AuthService);
    await auth.onModuleInit();
  });

  describe('register', () => {
    it('rejects a duplicate email', async () => {
      users.findOne.mockResolvedValueOnce({ id: 'existing' });
      await expect(auth.register({ email: 'a@a.com', password: 'Sup3r$ecret123' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates the user and returns an MFA setup token', async () => {
      users.findOne.mockResolvedValueOnce(null);
      users.save.mockResolvedValueOnce({ id: 'new-user-id', email: 'a@a.com' });

      const result = await auth.register({ email: 'A@A.com', password: 'Sup3r$ecret123' });

      expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@a.com' }));
      expect(result.userId).toBe('new-user-id');
      expect(typeof result.mfaSetupToken).toBe('string');
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing that it does not exist', async () => {
      users.findOne.mockResolvedValueOnce(null);
      await expect(auth.login({ email: 'ghost@a.com', password: 'whatever12345' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password for a known user', async () => {
      const passwords = new PasswordService();
      const passwordHash = await passwords.hash('correct-horse-battery-1');
      users.findOne.mockResolvedValueOnce({ id: 'u1', passwordHash, mfaEnabled: true });

      await expect(auth.login({ email: 'a@a.com', password: 'wrong-password' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('routes to MFA setup when the account has not enabled MFA yet', async () => {
      const passwords = new PasswordService();
      const passwordHash = await passwords.hash('correct-horse-battery-1');
      users.findOne.mockResolvedValueOnce({ id: 'u1', passwordHash, mfaEnabled: false });

      const result = await auth.login({ email: 'a@a.com', password: 'correct-horse-battery-1' });
      expect(result.status).toBe('mfa_setup_required');
    });

    it('routes to MFA challenge when the account already has MFA enabled', async () => {
      const passwords = new PasswordService();
      const passwordHash = await passwords.hash('correct-horse-battery-1');
      users.findOne.mockResolvedValueOnce({ id: 'u1', passwordHash, mfaEnabled: true });

      const result = await auth.login({ email: 'a@a.com', password: 'correct-horse-battery-1' });
      expect(result.status).toBe('mfa_challenge_required');
    });
  });

  describe('refresh — rotation & reuse detection', () => {
    it('revokes the whole token family when a refresh token is reused', async () => {
      const config = fakeConfig();
      const tokens = new TokenService(new JwtService(), config);
      const refreshToken = tokens.sign({ sub: 'u1', type: 'refresh', jti: 'jti-1', family: 'family-1' });

      // Le jeton est signé valide, mais la ligne correspondante en base est déjà révoquée
      // (cas d'un refresh token déjà utilisé une fois — signe possible de vol).
      refreshTokens.findOne.mockResolvedValueOnce({
        id: 'row-1',
        jti: 'jti-1',
        family: 'family-1',
        revoked: true,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(auth.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokens.update).toHaveBeenCalledWith({ family: 'family-1' }, { revoked: true });
    });

    it('rotates a valid refresh token into a new access/refresh pair', async () => {
      const config = fakeConfig();
      const tokens = new TokenService(new JwtService(), config);
      const refreshToken = tokens.sign({ sub: 'u1', type: 'refresh', jti: 'jti-1', family: 'family-1' });

      refreshTokens.findOne.mockResolvedValueOnce({
        id: 'row-1',
        jti: 'jti-1',
        family: 'family-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 100000),
      });
      refreshTokens.save.mockResolvedValueOnce({});

      const result = await auth.refresh(refreshToken);

      expect(refreshTokens.update).toHaveBeenCalledWith('row-1', { revoked: true });
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });
  });
});
