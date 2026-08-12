import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import NodeClam from 'clamscan';

@Injectable()
export class AntivirusService implements OnModuleInit {
  private readonly logger = new Logger(AntivirusService.name);
  private readonly enabled: boolean;
  private scanner: NodeClam | null = null;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>('CLAMAV_ENABLED') === 'true';
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      const isProduction = this.config.get<string>('NODE_ENV') === 'production';
      if (isProduction) {
        // En production, un import sans antivirus n'est pas acceptable — on
        // préfère un module qui ne démarre pas à un module qui accepte des
        // fichiers non scannés.
        throw new Error('CLAMAV_ENABLED doit être actif en production');
      }
      this.logger.warn(
        'Antivirus désactivé (CLAMAV_ENABLED=false) — acceptable uniquement en développement local',
      );
      return;
    }

    this.scanner = await new NodeClam().init({
      clamdscan: {
        host: this.config.get<string>('CLAMAV_HOST') ?? '127.0.0.1',
        port: this.config.get<number>('CLAMAV_PORT') ?? 3310,
        timeout: 30000,
      },
    });
  }

  // Le buffer est envoyé à clamd via un flux (passthrough), jamais écrit sur
  // disque — cohérent avec le reste du pipeline d'import.
  assertClean(buffer: Buffer, filename: string): Promise<void> {
    if (!this.enabled || !this.scanner) {
      return Promise.resolve();
    }
    const scanner = this.scanner;

    return new Promise<void>((resolve, reject) => {
      const av = scanner.passthrough();
      av.on('scan-complete', (result: { isInfected: boolean | null; viruses: string[] }) => {
        if (result.isInfected) {
          this.logger.warn(`Fichier infecté rejeté : ${filename} (${result.viruses.join(', ')})`);
          reject(new ServiceUnavailableException('Le fichier a été rejeté par le contrôle antivirus'));
          return;
        }
        resolve();
      });
      av.on('error', (error: Error) => reject(error));
      av.resume(); // on ne fait rien du flux de sortie, on veut juste le résultat du scan
      Readable.from(buffer).pipe(av);
    });
  }
}
