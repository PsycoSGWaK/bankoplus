import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Category } from './entities/category.entity';
import { CategoryRule } from './entities/category-rule.entity';
import { CategorySeeder } from './category.seeder';
import { CategorizationService } from './categorization.service';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Category, CategoryRule]), AuthModule],
  controllers: [CategoriesController, TransactionsController],
  providers: [CategorySeeder, CategorizationService, CategoriesService, TransactionsService],
  exports: [TypeOrmModule, CategorizationService],
})
export class TransactionsModule {}
