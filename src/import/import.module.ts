import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportBatch } from './entities/import-batch.entity';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ParsingService } from './services/parsing.service';
import { AntivirusService } from './services/antivirus.service';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImportBatch]), TransactionsModule, AccountsModule, AuthModule],
  controllers: [ImportController],
  providers: [ImportService, ParsingService, AntivirusService],
})
export class ImportModule {}
