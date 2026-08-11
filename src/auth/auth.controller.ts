import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TotpCodeDto } from './dto/totp-code.dto';
import { MfaChallengeGuard, MfaSetupGuard } from './guards/step-token.guard';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { Cookies } from '../common/decorators/cookies.decorator';
import { TokenService } from './services/token.service';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('mfa/setup')
  @UseGuards(MfaSetupGuard)
  @HttpCode(HttpStatus.OK)
  initiateMfaSetup(@CurrentUserId() userId: string) {
    return this.auth.initiateMfaSetup(userId);
  }

  @Post('mfa/enable')
  @UseGuards(MfaSetupGuard)
  @HttpCode(HttpStatus.OK)
  confirmMfaSetup(@CurrentUserId() userId: string, @Body() dto: TotpCodeDto) {
    return this.auth.confirmMfaSetup(userId, dto.code);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('login/verify')
  @UseGuards(MfaChallengeGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyMfaChallenge(
    @CurrentUserId() userId: string,
    @Body() dto: TotpCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.verifyMfaChallenge(userId, dto.code);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Cookies(REFRESH_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Jeton de rafraîchissement manquant');
    }
    const tokens = await this.auth.refresh(refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Cookies(REFRESH_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (refreshToken) {
      await this.auth.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.tokens.refreshExpiresInMs(),
    });
  }
}
