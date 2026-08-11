import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './services/password.service';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  // Hash de référence utilisé quand l'utilisateur n'existe pas, pour que le
  // temps de réponse de /login ne révèle pas si l'email est enregistré.
  private dummyHash = '';

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly passwords: PasswordService,
    private readonly mfa: MfaService,
    private readonly tokens: TokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.passwords.hash('timing-safe-comparison-baseline');
  }

  async register(dto: RegisterDto): Promise<{ userId: string; mfaSetupToken: string }> {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.save(this.users.create({ email, passwordHash }));

    return {
      userId: user.id,
      mfaSetupToken: this.tokens.sign({ sub: user.id, type: 'mfa_setup' }),
    };
  }

  async initiateMfaSetup(
    userId: string,
  ): Promise<{ otpauthUrl: string; qrCodeDataUrl: string; secret: string }> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (user.mfaEnabled) {
      throw new ConflictException('MFA déjà activée sur ce compte');
    }

    const { secret, encrypted } = this.mfa.generateEncryptedSecret();
    await this.users.update(user.id, { mfaSecretEncrypted: encrypted });

    const otpauthUrl = this.mfa.buildOtpAuthUrl(user.email, secret);
    const qrCodeDataUrl = await this.mfa.generateQrCodeDataUrl(otpauthUrl);

    return { otpauthUrl, qrCodeDataUrl, secret };
  }

  async confirmMfaSetup(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabled: true, mfaSecretEncrypted: true },
    });
    if (!user?.mfaSecretEncrypted) {
      throw new UnauthorizedException('Configuration MFA non initialisée');
    }
    if (user.mfaEnabled) {
      throw new ConflictException('MFA déjà activée sur ce compte');
    }
    if (!this.mfa.verifyCode(user.mfaSecretEncrypted, code)) {
      throw new UnauthorizedException('Code invalide');
    }

    await this.users.update(user.id, { mfaEnabled: true });
    return { message: 'MFA activée' };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ status: 'mfa_setup_required' | 'mfa_challenge_required'; token: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.users.findOne({
      where: { email },
      select: { id: true, email: true, passwordHash: true, mfaEnabled: true },
    });

    const hashToCheck = user?.passwordHash ?? this.dummyHash;
    const passwordValid = await this.passwords.verify(hashToCheck, dto.password);

    if (!user || !passwordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!user.mfaEnabled) {
      return {
        status: 'mfa_setup_required',
        token: this.tokens.sign({ sub: user.id, type: 'mfa_setup' }),
      };
    }

    return {
      status: 'mfa_challenge_required',
      token: this.tokens.sign({ sub: user.id, type: 'mfa_challenge' }),
    };
  }

  async verifyMfaChallenge(userId: string, code: string): Promise<TokenPair> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, mfaEnabled: true, mfaSecretEncrypted: true },
    });
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new UnauthorizedException('MFA non configurée pour ce compte');
    }
    if (!this.mfa.verifyCode(user.mfaSecretEncrypted, code)) {
      throw new UnauthorizedException('Code invalide');
    }

    return this.issueSession(userId, uuid());
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const payload = this.tokens.verify(rawToken, 'refresh');
    const family = payload.family as string;
    const jti = payload.jti as string;

    const row = await this.refreshTokens.findOne({ where: { jti } });
    if (!row || row.revoked || row.expiresAt < new Date()) {
      // Jeton inconnu, déjà utilisé ou expiré en base : réutilisation possible,
      // on révoque toute la famille pour forcer une reconnexion complète.
      await this.refreshTokens.update({ family }, { revoked: true });
      throw new UnauthorizedException('Session invalide, reconnexion nécessaire');
    }

    await this.refreshTokens.update(row.id, { revoked: true });
    return this.issueSession(payload.sub, family);
  }

  async logout(rawToken: string): Promise<void> {
    try {
      const payload = this.tokens.verify(rawToken, 'refresh');
      await this.refreshTokens.update({ family: payload.family }, { revoked: true });
    } catch {
      // Jeton déjà invalide : rien à révoquer, la déconnexion est idempotente.
    }
  }

  private async issueSession(userId: string, family: string): Promise<TokenPair> {
    const jti = uuid();
    const expiresAt = new Date(Date.now() + this.tokens.refreshExpiresInMs());

    await this.refreshTokens.save(
      this.refreshTokens.create({ jti, family, userId, expiresAt }),
    );

    return {
      accessToken: this.tokens.sign({ sub: userId, type: 'access' }),
      refreshToken: this.tokens.sign({ sub: userId, type: 'refresh', jti, family }),
    };
  }
}
