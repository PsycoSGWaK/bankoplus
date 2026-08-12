import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { EncryptionService } from '../../common/crypto/encryption.service';

@Injectable()
export class MfaService {
  constructor(
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  generateEncryptedSecret(): { secret: string; encrypted: string } {
    const secret = authenticator.generateSecret();
    return { secret, encrypted: this.encryption.encrypt(secret) };
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    const issuer = this.config.get<string>('MFA_ISSUER') ?? 'Banko+';
    return authenticator.keyuri(email, issuer, secret);
  }

  generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verifyCode(encryptedSecret: string, code: string): boolean {
    const secret = this.encryption.decrypt(encryptedSecret);
    return authenticator.verify({ token: code, secret });
  }
}
