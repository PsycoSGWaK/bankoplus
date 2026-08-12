import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ImportModule } from './import/import.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BudgetsModule } from './budgets/budgets.module';
import { AppController } from './app.controller';

// NestJS ne permet pas de remplacer proprement un guard enregistré via
// APP_GUARD dans les tests e2e (`overrideProvider`/`overrideGuard` ne
// l'atteignent pas — le mécanisme de collecte des guards globaux passe par
// un autre chemin que la résolution DI classique). Le rate-limiting n'a de
// toute façon pas sa place dans un test e2e qui enchaîne plusieurs
// inscriptions dans le même process : on ne l'enregistre pas quand Jest
// tourne (NODE_ENV=test, positionné par Jest lui-même).
const isTestEnv = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        // Jamais de synchronize, même en dev — le schéma n'évolue que par
        // migration explicite (`npm run migration:run`), pas automatiquement
        // au démarrage. Voir src/data-source.ts et src/migrations/.
        synchronize: false,
      }),
    }),
    AuthModule,
    AccountsModule,
    TransactionsModule,
    ImportModule,
    BudgetsModule,
  ],
  controllers: [AppController],
  providers: isTestEnv ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
