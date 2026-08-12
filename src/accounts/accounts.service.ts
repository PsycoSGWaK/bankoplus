import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(@InjectRepository(Account) private readonly accounts: Repository<Account>) {}

  create(userId: string, dto: CreateAccountDto): Promise<Account> {
    return this.accounts.save(
      this.accounts.create({
        userId,
        label: dto.label,
        bankName: dto.bankName ?? null,
        currency: dto.currency ?? 'EUR',
      }),
    );
  }

  findAllForUser(userId: string): Promise<Account[]> {
    return this.accounts.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** Vérifie que le compte existe et appartient bien à l'utilisateur — sinon lève. */
  async assertOwnership(userId: string, accountId: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Compte introuvable');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException("Ce compte n'appartient pas à l'utilisateur");
    }
    return account;
  }
}
