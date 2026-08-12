import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

export interface AccountWithBalance extends Account {
  // null = pas de solde de référence saisi, le solde actuel est inconnu —
  // à ne jamais confondre avec un solde de 0€.
  currentBalance: number | null;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
  ) {}

  async create(userId: string, dto: CreateAccountDto): Promise<AccountWithBalance> {
    this.assertReferencePairComplete(dto.referenceBalance, dto.referenceDate);

    const account = await this.accounts.save(
      this.accounts.create({
        userId,
        label: dto.label,
        bankName: dto.bankName ?? null,
        currency: dto.currency ?? 'EUR',
        referenceBalance: dto.referenceBalance ?? null,
        referenceDate: dto.referenceDate ?? null,
      }),
    );
    return this.withBalance(account);
  }

  async update(userId: string, accountId: string, dto: UpdateAccountDto): Promise<AccountWithBalance> {
    const account = await this.assertOwnership(userId, accountId);

    const referenceBalance = dto.referenceBalance ?? account.referenceBalance ?? undefined;
    const referenceDate = dto.referenceDate ?? account.referenceDate ?? undefined;
    if (dto.referenceBalance !== undefined || dto.referenceDate !== undefined) {
      this.assertReferencePairComplete(referenceBalance, referenceDate);
    }

    Object.assign(account, {
      label: dto.label ?? account.label,
      bankName: dto.bankName ?? account.bankName,
      currency: dto.currency ?? account.currency,
      referenceBalance: referenceBalance ?? null,
      referenceDate: referenceDate ?? null,
    });

    const saved = await this.accounts.save(account);
    return this.withBalance(saved);
  }

  async findAllForUser(userId: string): Promise<AccountWithBalance[]> {
    const accounts = await this.accounts.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(accounts.map((account) => this.withBalance(account)));
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

  private async withBalance(account: Account): Promise<AccountWithBalance> {
    return { ...account, currentBalance: await this.computeCurrentBalance(account) };
  }

  private async computeCurrentBalance(account: Account): Promise<number | null> {
    if (account.referenceBalance === null || account.referenceDate === null) {
      return null;
    }

    const row = await this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.accountId = :accountId', { accountId: account.id })
      .andWhere('t.date >= :referenceDate', { referenceDate: account.referenceDate })
      .getRawOne<{ sum: string }>();

    return account.referenceBalance + parseFloat(row?.sum ?? '0');
  }

  private assertReferencePairComplete(balance: number | undefined, date: string | undefined): void {
    if ((balance === undefined) !== (date === undefined)) {
      throw new BadRequestException(
        'referenceBalance et referenceDate doivent être renseignés ensemble (ou aucun des deux)',
      );
    }
  }
}
