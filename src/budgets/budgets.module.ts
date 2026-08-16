import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Budget } from './entities/budget.entity';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Budget]), TransactionsModule, AccountsModule, AuthModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
