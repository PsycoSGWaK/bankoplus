import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload, TokenType } from '../interfaces/jwt-payload.interface';

interface SecretConfig {
  secret: string;
  expiresIn: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secretFor(type: TokenType): SecretConfig {
    switch (type) {
      case 'access':
        return {
          secret: this.require('JWT_ACCESS_SECRET'),
          expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
        };
      case 'refresh':
        return {
          secret: this.require('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
        };
      case 'mfa_setup':
        return {
          secret: this.require('JWT_MFA_SETUP_SECRET'),
          expiresIn: this.config.get<string>('JWT_MFA_SETUP_EXPIRES_IN') ?? '10m',
        };
      case 'mfa_challenge':
        return {
          secret: this.require('JWT_MFA_CHALLENGE_SECRET'),
          expiresIn: this.config.get<string>('JWT_MFA_CHALLENGE_EXPIRES_IN') ?? '5m',
        };
    }
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Variable d'environnement manquante : ${key}`);
    }
    return value;
  }

  sign(payload: JwtPayload): string {
    const { secret, expiresIn } = this.secretFor(payload.type);
    return this.jwt.sign(payload, { secret, expiresIn });
  }

  verify(token: string, type: TokenType): JwtPayload {
    const { secret } = this.secretFor(type);
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { secret });
      if (payload.type !== type) {
        throw new UnauthorizedException('Type de jeton invalide');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
  }

  refreshExpiresInMs(): number {
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    return this.parseDurationToMs(expiresIn);
  }

  private parseDurationToMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] ?? 86400000;
    return value * unitMs;
  }
}
