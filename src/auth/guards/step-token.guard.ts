import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../services/token.service';
import { TokenType } from '../interfaces/jwt-payload.interface';

interface RequestWithUserId extends Request {
  userId?: string;
}

/**
 * Vérifie un jeton JWT à usage unique (mfa_setup, mfa_challenge) transmis en
 * Authorization: Bearer — distinct du JwtAuthGuard qui protège les ressources
 * générales avec un access token.
 */
abstract class StepTokenGuard implements CanActivate {
  protected abstract readonly type: TokenType;

  constructor(protected readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Jeton manquant');
    }
    const token = header.slice('Bearer '.length);
    const payload = this.tokens.verify(token, this.type);
    request.userId = payload.sub;
    return true;
  }
}

@Injectable()
export class MfaSetupGuard extends StepTokenGuard {
  protected readonly type: TokenType = 'mfa_setup';

  // Constructeur explicite requis : sans lui, TypeScript n'émet pas les
  // métadonnées design:paramtypes sur la sous-classe et Nest injecte
  // `undefined` à la place de TokenService.
  constructor(tokens: TokenService) {
    super(tokens);
  }
}

@Injectable()
export class MfaChallengeGuard extends StepTokenGuard {
  protected readonly type: TokenType = 'mfa_challenge';

  constructor(tokens: TokenService) {
    super(tokens);
  }
}
