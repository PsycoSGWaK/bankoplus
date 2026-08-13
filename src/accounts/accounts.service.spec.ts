import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

function qbMock(sum: string | null) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(sum === null ? undefined : { sum }),
  };
}

function accountsRepoMock() {
  return {
    save: jest.fn((x) => Promise.resolve({ id: 'acc-1', ...x })),
    create: jest.fn((x) => x),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

describe('AccountsService', () => {
  let service: AccountsService;
  let accounts: ReturnType<typeof accountsRepoMock>;
  let transactions: { createQueryBuilder: jest.Mock };

  beforeEach(() => {
    accounts = accountsRepoMock();
    transactions = { createQueryBuilder: jest.fn(() => qbMock('0')) };
    service = new AccountsService(accounts as any, transactions as any);
  });

  describe('create', () => {
    it('rejects a reference balance without a reference date', async () => {
      await expect(service.create('u1', { label: 'Compte', referenceBalance: 100 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a reference date without a reference balance', async () => {
      await expect(
        service.create('u1', { label: 'Compte', referenceDate: '2026-06-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an account with currentBalance null when no reference is set', async () => {
      const account = await service.create('u1', { label: 'Compte' });
      expect(account.currentBalance).toBeNull();
    });

    it('computes currentBalance as referenceBalance + transactions since referenceDate', async () => {
      transactions.createQueryBuilder.mockReturnValueOnce(qbMock('125.50'));

      const account = await service.create('u1', {
        label: 'Compte',
        referenceBalance: 400,
        referenceDate: '2026-06-01',
      });

      expect(account.currentBalance).toBe(525.5);
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a missing account', async () => {
      accounts.findOne.mockResolvedValueOnce(null);
      await expect(service.update('u1', 'missing', { label: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for an account owned by someone else', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', userId: 'someone-else' });
      await expect(service.update('u1', 'acc-1', { label: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('lets a follow-up update set only the balance, reusing the existing reference date', async () => {
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'u1',
        label: 'Compte',
        bankName: null,
        currency: 'EUR',
        referenceBalance: 400,
        referenceDate: '2026-06-01',
      });
      transactions.createQueryBuilder.mockReturnValueOnce(qbMock('0'));

      const updated = await service.update('u1', 'acc-1', { referenceBalance: 450 });

      expect(updated.referenceBalance).toBe(450);
      expect(updated.referenceDate).toBe('2026-06-01');
    });

    it('rejects setting only the date when no reference balance exists yet', async () => {
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'u1',
        referenceBalance: null,
        referenceDate: null,
      });

      await expect(
        service.update('u1', 'acc-1', { referenceDate: '2026-06-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllForUser', () => {
    it('attaches the computed balance to every account', async () => {
      accounts.find.mockResolvedValueOnce([
        { id: 'acc-1', userId: 'u1', referenceBalance: 100, referenceDate: '2026-06-01' },
        { id: 'acc-2', userId: 'u1', referenceBalance: null, referenceDate: null },
      ]);
      transactions.createQueryBuilder.mockReturnValueOnce(qbMock('50'));

      const result = await service.findAllForUser('u1');

      expect(result[0].currentBalance).toBe(150);
      expect(result[1].currentBalance).toBeNull();
    });
  });
});
