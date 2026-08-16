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
  let categorization: { assertVisible: jest.Mock; fixedExpenseCategoryIds: jest.Mock; salaryCategoryId: jest.Mock };
  let accounts: { findAllForUser: jest.Mock };

  beforeEach(() => {
    budgets = budgetsRepoMock();
    transactions = { createQueryBuilder: jest.fn(() => qbMock()) };
    categorization = {
      assertVisible: jest.fn().mockResolvedValue(undefined),
      // Par défaut aucune catégorie n'est "dépense fixe", pour ne pas coupler
      // les tests qui ne portent pas là-dessus au nouveau mécanisme —
      // celui-ci a ses propres tests dédiés ci-dessous.
      fixedExpenseCategoryIds: jest.fn().mockResolvedValue(new Set()),
      // Par défaut pas de catégorie Salaire trouvée, pour ne pas coupler les
      // tests qui ne portent pas sur le revenu au nouveau mécanisme.
      salaryCategoryId: jest.fn().mockResolvedValue(null),
    };
    // Par défaut aucun compte n'a de solde de référence connu, pour ne pas
    // coupler les tests existants au nouveau mécanisme de solde projeté.
    accounts = { findAllForUser: jest.fn().mockResolvedValue([]) };
    service = new BudgetsService(budgets as any, transactions as any, categorization as any, accounts as any);
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
      transactions.createQueryBuilder
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-1', total: '-120.00' }])) // sumExpensesByCategory
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-1', label: 'X', amount: '-120.00' }])); // expenseEntriesByCategory (mois courant)

      const now = new Date(2026, 7, 10); // jour 10 sur 31
      jest.useFakeTimers().setSystemTime(now);

      const [progress] = await service.list('u1');

      expect(progress.spent).toBe(120);
      expect(progress.remaining).toBe(0); // jamais négatif
      expect(progress.percentUsed).toBe(120);
      expect(progress.isOverBudget).toBe(true);

      jest.useRealTimers();
    });

    it('reports only the amount already spent for a category not flagged "dépense fixe", without extrapolating', async () => {
      budgets.find.mockResolvedValueOnce([{ id: 'b1', categoryId: 'cat-x', monthlyLimit: 5000 }]);
      // fixedExpenseCategoryIds reste vide (défaut) -> pas de requête sur le
      // mois précédent, pas de projection pour une dépense ponctuelle.
      transactions.createQueryBuilder
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-x', total: '-100.00' }])) // sumExpensesByCategory
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-x', label: 'DIVERS', amount: '-100.00' }])); // mois courant

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10)); // jour 10 sur 31

      const [progress] = await service.list('u1');

      // Pas d'extrapolation : la projection reste égale au dépensé.
      expect(progress.projectedMonthEnd).toBe(100);
      expect(transactions.createQueryBuilder).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('projects a fixed-expense category by carrying forward last month\'s bill until it repeats this month', async () => {
      budgets.find.mockResolvedValueOnce([{ id: 'b1', categoryId: 'cat-loyer', monthlyLimit: 900 }]);
      categorization.fixedExpenseCategoryIds.mockResolvedValueOnce(new Set(['cat-loyer']));

      transactions.createQueryBuilder
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-loyer', total: '0.00' }])) // sumExpensesByCategory : rien encore prélevé
        .mockReturnValueOnce(qbMock([])) // expenseEntriesByCategory mois courant : rien encore prélevé
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-loyer', label: 'LOYER', amount: '-800.00' }])); // mois précédent

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3)); // jour 3 sur 31, loyer pas encore tombé

      const [progress] = await service.list('u1');

      expect(progress.projectedMonthEnd).toBe(800);
      expect(progress.isProjectedOverBudget).toBe(false);

      jest.useRealTimers();
    });

    it('does not add anything extra once the fixed-expense bill has already passed this month', async () => {
      budgets.find.mockResolvedValueOnce([{ id: 'b1', categoryId: 'cat-loyer', monthlyLimit: 900 }]);
      categorization.fixedExpenseCategoryIds.mockResolvedValueOnce(new Set(['cat-loyer']));

      transactions.createQueryBuilder
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-loyer', total: '-800.00' }])) // sumExpensesByCategory
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-loyer', label: 'LOYER', amount: '-800.00' }])) // mois courant : déjà tombé
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-loyer', label: 'LOYER', amount: '-800.00' }])); // mois précédent

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3));

      const [progress] = await service.list('u1');

      expect(progress.projectedMonthEnd).toBe(800);

      jest.useRealTimers();
    });
  });

  describe('overview', () => {
    // overview() lance plusieurs requêtes en parallèle (Promise.all imbriqués) :
    // l'ordre d'appel exact de transactions.createQueryBuilder n'est pas
    // stable/lisible à prédire à la main. On route donc chaque appel selon les
    // conditions where/andWhere qu'il pose, plutôt que selon son rang d'appel.
    function trackedQb(responder: (conditions: string[], params: Record<string, unknown>, type: 'one' | 'many') => unknown) {
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};
      const qb: any = {
        select: jest.fn(() => qb),
        addSelect: jest.fn(() => qb),
        where: jest.fn((cond: string, p?: Record<string, unknown>) => {
          conditions.push(cond);
          Object.assign(params, p ?? {});
          return qb;
        }),
        andWhere: jest.fn((cond: string, p?: Record<string, unknown>) => {
          conditions.push(cond);
          Object.assign(params, p ?? {});
          return qb;
        }),
        groupBy: jest.fn(() => qb),
        getRawOne: jest.fn(() => Promise.resolve(responder(conditions, params, 'one'))),
        getRawMany: jest.fn(() => Promise.resolve(responder(conditions, params, 'many'))),
      };
      return qb;
    }

    it("bases this month's income on last month's salary instead of what has already landed this month", async () => {
      categorization.salaryCategoryId.mockResolvedValue('cat-salaire');

      transactions.createQueryBuilder.mockImplementation(() =>
        trackedQb((conditions, params, type) => {
          const joined = conditions.join(' | ');
          if (joined.includes('t.amount > 0') && joined.includes('!= :categoryId')) {
            // Autres revenus (hors salaire) du mois courant : une allocation de 200€.
            return { total: '200.00' };
          }
          if (joined.includes('t.amount > 0') && joined.includes('t.categoryId = :categoryId')) {
            // Salaire : seul le mois précédent (juillet) doit être interrogé pour un montant non nul.
            return params.start === '2026-07-01' ? { total: '2000.00' } : { total: '0.00' };
          }
          if (joined.includes('t.amount < 0')) {
            return type === 'one' ? { total: '-500.00' } : [];
          }
          return type === 'one' ? { total: '0' } : [];
        }),
      );

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 16)); // 16 août 2026

      const overview = await service.overview('u1');

      // 200€ (autres revenus d'août) + 2000€ (salaire de juillet, pas celui d'août).
      expect(overview.totalIncome).toBe(2200);

      jest.useRealTimers();
    });

    it('falls back to summing this month\'s income as-is when no Salaire category exists', async () => {
      categorization.salaryCategoryId.mockResolvedValue(null);
      transactions.createQueryBuilder.mockReturnValue(qbMock([], { total: '900.00' }));

      const overview = await service.overview('u1');

      expect(overview.totalIncome).toBe(900);
    });

    it('bases projectedBalance on the real known account balance, adding only what has not happened yet', async () => {
      categorization.salaryCategoryId.mockResolvedValue('cat-salaire');
      // Un compte avec solde de référence connu (500€), un sans (ignoré).
      accounts.findAllForUser.mockResolvedValue([{ currentBalance: 500 }, { currentBalance: null }]);

      transactions.createQueryBuilder.mockImplementation(() =>
        trackedQb((conditions, params, type) => {
          const joined = conditions.join(' | ');
          const isPreviousMonth = params.start === '2026-07-01';

          if (joined.includes('t.amount > 0') && joined.includes('!= :categoryId')) {
            return { total: '0.00' }; // pas d'autre revenu ce mois-ci
          }
          if (joined.includes('t.amount > 0') && joined.includes('t.categoryId = :categoryId')) {
            if (type === 'one') {
              // sumIncomeByCategory (projectedTotalIncome, non lié au solde)
              return isPreviousMonth ? { total: '2000.00' } : { total: '0.00' };
            }
            // incomeEntriesForCategory (expectedRemainingSalary) : salaire de
            // juillet, pas encore repassé en août.
            return isPreviousMonth ? [{ label: 'REVIMA', amount: '2000.00' }] : [];
          }
          if (joined.includes('t.amount < 0')) {
            if (type === 'one') return { total: '-300.00' }; // sumWhere : dépenses du mois
            return [{ categoryId: 'cat-loisirs', label: 'X', amount: '-300.00' }]; // même montant, aucune catégorie fixe
          }
          return type === 'one' ? { total: '0' } : [];
        }),
      );

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 16)); // 16 août 2026

      const overview = await service.overview('u1');

      expect(overview.currentBalance).toBe(500);
      // 500€ actuels + 2000€ de salaire pas encore tombé - 0€ de reste attendu côté dépenses.
      expect(overview.projectedBalance).toBe(2500);

      jest.useRealTimers();
    });

    it('falls back to the income-minus-expenses formula when no account has a known balance', async () => {
      accounts.findAllForUser.mockResolvedValue([{ currentBalance: null }]);
      transactions.createQueryBuilder.mockReturnValue(qbMock([], { total: '100.00' }));

      const overview = await service.overview('u1');

      expect(overview.currentBalance).toBeNull();
      expect(overview.projectedBalance).toBe(overview.totalIncome - overview.projectedExpensesMonthEnd);
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
      // Catégorie non flaggée "dépense fixe" : pas d'extrapolation, la
      // projection après achat est juste le dépensé après achat.
      expect(result.projectedMonthEndAfterPurchase).toBe(110);
    });

    it('returns null budget fields when no budget is set for the category', async () => {
      transactions.createQueryBuilder.mockReturnValueOnce(qbMock([]));
      budgets.findOne.mockResolvedValueOnce(null);

      const result = await service.simulate('u1', { amount: 30, categoryId: 'cat-unbudgeted' });

      expect(result.budgetLimit).toBeNull();
      expect(result.wouldExceedBudget).toBeNull();
    });

    it('adds the still-pending previous-month bill on top of a simulated purchase for a fixed-expense category', async () => {
      categorization.fixedExpenseCategoryIds.mockResolvedValueOnce(new Set(['cat-assurance']));
      transactions.createQueryBuilder
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-assurance', total: '0.00' }])) // spentBefore
        .mockReturnValueOnce(qbMock([{ categoryId: 'cat-assurance', label: 'ASSURANCE HABITATION', amount: '-50.00' }])) // mois précédent
        .mockReturnValueOnce(qbMock([])); // mois courant : pas encore prélevée
      budgets.findOne.mockResolvedValueOnce({ id: 'b1', categoryId: 'cat-assurance', monthlyLimit: 100 });

      const result = await service.simulate('u1', { amount: 20, categoryId: 'cat-assurance' });

      expect(result.spentAfterPurchase).toBe(20);
      // 20€ d'achat simulé + 50€ d'assurance pas encore prélevée ce mois-ci.
      expect(result.projectedMonthEndAfterPurchase).toBe(70);
    });
  });
});
