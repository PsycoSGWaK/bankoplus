import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BudgetsService } from './budgets.service';

function qbMock(rawMany: unknown[] = [], rawOne: unknown = { total: '0' }) {
  const qb: any = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    getRawMany: jest.fn().mockResolvedValue(rawMany),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
  };
  return qb;
}

function budgetsRepoMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((x) => Promise.resolve({ id: 'budget-1', ...x })),
    create: jest.fn((x) => x),
    remove: jest.fn(),
  };
}

describe('BudgetsService', () => {
  let service: BudgetsService;
  let budgets: ReturnType<typeof budgetsRepoMock>;
  let transactions: { createQueryBuilder: jest.Mock };
  let categorization: { assertVisible: jest.Mock };

  beforeEach(() => {
    budgets = budgetsRepoMock();
    transactions = { createQueryBuilder: jest.fn(() => qbMock()) };
    categorization = { assertVisible: jest.fn().mockResolvedValue(undefined) };
    service = new BudgetsService(budgets as any, transactions as any, categorization as any);
  });

  describe('upsert', () => {
    it('creates a new budget when none exists for the category', async () => {
      budgets.findOne.mockResolvedValueOnce(null);
      const result = await service.upsert('u1', { categoryId: 'cat-1', monthlyLimit: 200 });

      expect(categorization.assertVisible).toHaveBeenCalledWith('u1', 'cat-1');
      expect(budgets.create).toHaveBeenCalledWith({ userId: 'u1', categoryId: 'cat-1', monthlyLimit: 200 });
      expect(result.monthlyLimit).toBe(200);
    });

    it('updates the existing budget instead of duplicating it', async () => {
      const existing = { id: 'budget-1', userId: 'u1', categoryId: 'cat-1', monthlyLimit: 200 };
      budgets.findOne.mockResolvedValueOnce(existing);

      await service.upsert('u1', { categoryId: 'cat-1', monthlyLimit: 350 });

      expect(budgets.create).not.toHaveBeenCalled();
      expect(budgets.save).toHaveBeenCalledWith(expect.objectContaining({ monthlyLimit: 350 }));
    });

    it('skips category visibility checks for a global budget (no categoryId)', async () => {
      budgets.findOne.mockResolvedValueOnce(null);
      await service.upsert('u1', { monthlyLimit: 1000 });
      expect(categorization.assertVisible).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the budget does not exist', async () => {
      budgets.findOne.mockResolvedValueOnce(null);
      await expect(service.remove('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when the budget belongs to someone else", async () => {
      budgets.findOne.mockResolvedValueOnce({ id: 'b1', userId: 'someone-else' });
      await expect(service.remove('u1', 'b1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('computes spent, remaining, percentUsed and over-budget flags per category', async () => {
      budgets.find.mockResolvedValueOnce([{ id: 'b1', categoryId: 'cat-1', monthlyLimit: 100 }]);
      transactions.createQueryBuilder.mockReturnValueOnce(
        qbMock([{ categoryId: 'cat-1', total: '-120.00' }]),
      );

      const now = new Date(2026, 7, 10); // jour 10 sur 31
      jest.useFakeTimers().setSystemTime(now);

      const [progress] = await service.list('u1');

      expect(progress.spent).toBe(120);
      expect(progress.remaining).toBe(0); // jamais négatif
      expect(progress.percentUsed).toBe(120);
      expect(progress.isOverBudget).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('simulate', () => {
    it('flags a simulated purchase that would push spending over the category budget', async () => {
      transactions.createQueryBuilder.mockReturnValueOnce(
        qbMock([{ categoryId: 'cat-1', total: '-80.00' }]),
      );
      budgets.findOne.mockResolvedValueOnce({ id: 'b1', categoryId: 'cat-1', monthlyLimit: 100 });

      const result = await service.simulate('u1', { amount: 30, categoryId: 'cat-1' });

      expect(result.spentAfterPurchase).toBe(110);
      expect(result.wouldExceedBudget).toBe(true);
    });

    it('returns null budget fields when no budget is set for the category', async () => {
      transactions.createQueryBuilder.mockReturnValueOnce(qbMock([]));
      budgets.findOne.mockResolvedValueOnce(null);

      const result = await service.simulate('u1', { amount: 30, categoryId: 'cat-unbudgeted' });

      expect(result.budgetLimit).toBeNull();
      expect(result.wouldExceedBudget).toBeNull();
    });
  });
});
