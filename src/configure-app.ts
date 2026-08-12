import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

/**
 * Configuration partagée entre le vrai bootstrap (main.ts) et les tests e2e,
 * pour ne jamais tester une app qui diverge de celle qui tourne réellement.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
