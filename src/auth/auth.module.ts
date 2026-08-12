import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MfaChallengeGuard, MfaSetupGuard } from './guards/step-token.guard';
import { EncryptionService } from '../common/crypto/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    MfaService,
    TokenService,
    EncryptionService,
    JwtStrategy,
    JwtAuthGuard,
    MfaSetupGuard,
    MfaChallengeGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
