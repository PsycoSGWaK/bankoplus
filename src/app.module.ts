import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ImportModule } from './import/import.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AppController } from './app.controller';

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
        // Migrations, pas de synchronize automatique en dehors du dev local.
        synchronize: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    AccountsModule,
    TransactionsModule,
    ImportModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
