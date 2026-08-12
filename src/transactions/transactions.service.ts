import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CategorizationService } from './categorization.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    private readonly categorization: CategorizationService,
  ) {}

  findAllForUser(userId: string, accountId?: string): Promise<Transaction[]> {
    return this.transactions.find({
      where: accountId ? { userId, accountId } : { userId },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  async assignCategory(userId: string, transactionId: string, categoryId: string | null): Promise<Transaction> {
    const transaction = await this.transactions.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction introuvable');
    }
    if (transaction.userId !== userId) {
      throw new ForbiddenException("Cette transaction n'appartient pas à l'utilisateur");
    }

    if (categoryId) {
      await this.categorization.assertVisible(userId, categoryId);
    }

    transaction.categoryId = categoryId;
    return this.transactions.save(transaction);
  }
}
