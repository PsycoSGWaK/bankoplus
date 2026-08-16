import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Budget } from './entities/budget.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CategorizationService } from '../transactions/categorization.service';
import { AccountsService } from '../accounts/accounts.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { SimulatePurchaseDto } from './dto/simulate-purchase.dto';
import { MonthRange, previousMonthRange, resolveMonthRange } from './utils/month-range.util';
import { ExpenseEntry, expectedRemainingForFixedExpense } from './utils/fixed-expense-matching.util';

const UNCATEGORIZED_KEY = 'UNCATEGORIZED';

export interface BudgetProgress {
  id: string;
  categoryId: string | null;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  projectedMonthEnd: number;
  isOverBudget: boolean;
  isProjectedOverBudget: boolean;
}

export interface MonthOverview {
  month: string;
  daysElapsed: number;
  daysInMonth: number;
  isCurrentMonth: boolean;
  // Somme des soldes actuels connus (comptes avec référence renseignée),
  // null si aucun compte n'a de référence — voir projectedBalance.
  currentBalance: number | null;
  totalIncome: number;
  totalExpenses: number;
  projectedExpensesMonthEnd: number;
  projectedBalance: number;
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget) private readonly budgets: Repository<Budget>,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    private readonly categorization: CategorizationService,
    private readonly accounts: AccountsService,
  ) {}

  async upsert(userId: string, dto: UpsertBudgetDto): Promise<Budget> {
    const categoryId = dto.categoryId ?? null;
    if (categoryId) {
      await this.categorization.assertVisible(userId, categoryId);
    }

    const existing = await this.budgets.findOne({
      where: { userId, categoryId: categoryId ?? IsNull() },
    });

    if (existing) {
      existing.monthlyLimit = dto.monthlyLimit;
      return this.budgets.save(existing);
    }

    return this.budgets.save(this.budgets.create({ userId, categoryId, monthlyLimit: dto.monthlyLimit }));
  }

  async remove(userId: string, budgetId: string): Promise<void> {
    const budget = await this.budgets.findOne({ where: { id: budgetId } });
    if (!budget) {
      throw new NotFoundException('Budget introuvable');
    }
    if (budget.userId !== userId) {
      throw new ForbiddenException("Ce budget n'appartient pas à l'utilisateur");
    }
    await this.budgets.remove(budget);
  }

  async list(userId: string, month?: string): Promise<BudgetProgress[]> {
    const range = resolveMonthRange(month);
    const [budgets, spentByCategory, projection] = await Promise.all([
      this.budgets.find({ where: { userId } }),
      this.sumExpensesByCategory(userId, range.start, range.end),
      this.projectExpensesByCategory(userId, range),
    ]);

    return budgets.map((budget) => {
      const key = budget.categoryId ?? 'GLOBAL';
      const spent = spentByCategory.get(key) ?? 0;
      // Un budget global suit la projection agrégée (somme des projections
      // par catégorie) ; un budget de catégorie suit sa propre projection,
      // qui tient compte de sa récurrence éventuelle.
      const projectedMonthEnd = budget.categoryId
        ? (projection.perCategory.get(budget.categoryId) ?? 0)
        : projection.total;

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        monthlyLimit: budget.monthlyLimit,
        spent,
        remaining: Math.max(budget.monthlyLimit - spent, 0),
        percentUsed: budget.monthlyLimit > 0 ? Math.round((spent / budget.monthlyLimit) * 100) : 0,
        projectedMonthEnd,
        isOverBudget: spent > budget.monthlyLimit,
        isProjectedOverBudget: projectedMonthEnd > budget.monthlyLimit,
      };
    });
  }

  async overview(userId: string, month?: string): Promise<MonthOverview> {
    const range = resolveMonthRange(month);

    const [totalIncome, { total: totalExpensesRaw }, projection, currentBalance] = await Promise.all([
      this.projectedTotalIncome(userId, range),
      this.sumWhere(userId, range.start, range.end, '<'),
      this.projectExpensesByCategory(userId, range),
      this.totalKnownCurrentBalance(userId),
    ]);
    const totalExpenses = Math.abs(totalExpensesRaw);
    const projectedExpensesMonthEnd = projection.total;

    // Avec un solde de compte connu, le solde projeté ne compte aucun revenu
    // à venir (le salaire de fin de mois sert à vivre le mois suivant, pas à
    // financer la fin du mois en cours) — seulement le solde actuel moins ce
    // qu'il reste à dépenser sur les factures fixes pas encore tombées. Sans
    // solde connu (aucun compte avec référence renseignée), on retombe sur
    // l'ancien flux (revenus - dépenses projetées), moins précis mais mieux
    // que rien.
    const projectedBalance =
      currentBalance !== null ? currentBalance - projection.remaining : totalIncome - projectedExpensesMonthEnd;

    return {
      month: `${range.year}-${String(range.month).padStart(2, '0')}`,
      daysElapsed: range.daysElapsed,
      daysInMonth: range.daysInMonth,
      isCurrentMonth: range.isCurrentMonth,
      currentBalance,
      totalIncome,
      totalExpenses,
      projectedExpensesMonthEnd,
      projectedBalance,
    };
  }

  async simulate(userId: string, dto: SimulatePurchaseDto) {
    const range = resolveMonthRange();
    const key = dto.categoryId ?? 'GLOBAL';

    const [spentByCategory, budget, fixedExpenseIds, currentBalance, projection] = await Promise.all([
      this.sumExpensesByCategory(userId, range.start, range.end),
      dto.categoryId
        ? this.budgets.findOne({ where: { userId, categoryId: dto.categoryId } })
        : this.budgets.findOne({ where: { userId, categoryId: IsNull() } }),
      this.categorization.fixedExpenseCategoryIds(userId),
      this.totalKnownCurrentBalance(userId),
      this.projectExpensesByCategory(userId, range),
    ]);

    const spentBefore = spentByCategory.get(key) ?? 0;
    const spentAfter = spentBefore + dto.amount;

    // Une catégorie non flaggée "dépense fixe" (ou le budget global, qui est
    // une agrégation) n'a pas de projection fiable — on ne prétend pas
    // deviner la suite d'une dépense ponctuelle, on affiche juste le dépensé.
    // Pour une catégorie fixe, on réutilise le "pas encore tombé" déjà
    // calculé par projectExpensesByCategory plutôt que de le recalculer.
    const projectedMonthEndAfter =
      dto.categoryId && fixedExpenseIds.has(dto.categoryId)
        ? (projection.perCategory.get(dto.categoryId) ?? 0) + dto.amount
        : spentAfter;

    // Solde projeté actuel (même formule que overview()) moins l'achat
    // simulé — pour répondre à "si je fais cet achat maintenant, il me
    // restera combien d'ici la fin du mois ?".
    const projectedBalanceNow =
      currentBalance !== null
        ? currentBalance - projection.remaining
        : (await this.projectedTotalIncome(userId, range)) - projection.total;
    const projectedBalanceAfterPurchase = projectedBalanceNow - dto.amount;

    return {
      categoryId: dto.categoryId ?? null,
      amount: dto.amount,
      spentBeforePurchase: spentBefore,
      spentAfterPurchase: spentAfter,
      projectedMonthEndAfterPurchase: projectedMonthEndAfter,
      projectedBalanceAfterPurchase,
      budgetLimit: budget?.monthlyLimit ?? null,
      wouldExceedBudget: budget ? spentAfter > budget.monthlyLimit : null,
      wouldExceedProjectedBudget: budget ? projectedMonthEndAfter > budget.monthlyLimit : null,
    };
  }

  /** Somme des dépenses (montants négatifs) du mois, groupée par catégorie — clé 'GLOBAL' pour categoryId null. */
  private async sumExpensesByCategory(
    userId: string,
    start: string,
    end: string,
  ): Promise<Map<string, number>> {
    const rows = await this.expenseRowsByCategory(userId, start, end);

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.categoryId ?? 'GLOBAL', Math.abs(parseFloat(row.total)));
    }
    // Le seuil global agrège toutes les dépenses, pas seulement celles sans catégorie.
    const globalTotal = rows.reduce((sum, row) => sum + Math.abs(parseFloat(row.total)), 0);
    map.set('GLOBAL', globalTotal);
    return map;
  }

  private async expenseRowsByCategory(
    userId: string,
    start: string,
    end: string,
  ): Promise<{ categoryId: string | null; total: string }[]> {
    return this.transactions
      .createQueryBuilder('t')
      .select('t.categoryId', 'categoryId')
      .addSelect('SUM(t.amount)', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', { start, end })
      .andWhere('t.amount < 0')
      .groupBy('t.categoryId')
      .getRawMany<{ categoryId: string | null; total: string }>();
  }

  /** Dépenses (libellé + montant) du mois `start`-`end`, groupées par catégorie. */
  private async expenseEntriesByCategory(
    userId: string,
    start: string,
    end: string,
  ): Promise<Map<string, ExpenseEntry[]>> {
    const rows = await this.transactions
      .createQueryBuilder('t')
      .select(['t.categoryId AS categoryId', 't.label AS label', 't.amount AS amount'])
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', { start, end })
      .andWhere('t.amount < 0')
      .getRawMany<{ categoryId: string | null; label: string; amount: string }>();

    const map = new Map<string, ExpenseEntry[]>();
    for (const row of rows) {
      const key = row.categoryId ?? UNCATEGORIZED_KEY;
      const arr = map.get(key) ?? [];
      arr.push({ label: row.label, amount: parseFloat(row.amount) });
      map.set(key, arr);
    }
    return map;
  }

  /**
   * Projection de fin de mois par catégorie : les catégories marquées
   * "dépense fixe" (voir fixed-expense-matching.util.ts) comparent les
   * dépenses du mois précédent à celles déjà passées ce mois-ci et projettent
   * ce qui n'est pas encore tombé. Les autres catégories (dépense ponctuelle
   * par nature — courses, loisirs, non catégorisé...) n'ont pas de mécanisme
   * de projection fiable : extrapoler linéairement une grosse dépense isolée
   * comme si elle allait se reproduire au même rythme jusqu'à la fin du mois
   * est trompeur, donc on affiche simplement ce qui est déjà dépensé, sans
   * prétendre deviner la suite. `total` est la somme de ces valeurs, utilisée
   * pour le budget global et l'overview.
   */
  private async projectExpensesByCategory(
    userId: string,
    range: MonthRange,
  ): Promise<{ perCategory: Map<string, number>; total: number; remaining: number }> {
    const [currentEntriesByCategory, fixedExpenseIds] = await Promise.all([
      this.expenseEntriesByCategory(userId, range.start, range.end),
      this.categorization.fixedExpenseCategoryIds(userId),
    ]);

    const previousRange = previousMonthRange(range);
    const previousEntriesByCategory =
      fixedExpenseIds.size > 0 ? await this.expenseEntriesByCategory(userId, previousRange.start, previousRange.end) : new Map<string, ExpenseEntry[]>();

    const keys = new Set([...currentEntriesByCategory.keys(), ...previousEntriesByCategory.keys()]);
    const perCategory = new Map<string, number>();
    let total = 0;
    // Part de `total` qui n'est pas encore dépensée (factures fixes pas
    // encore tombées) — c'est ce qu'il reste à soustraire d'un solde de
    // compte déjà à jour, par opposition à `total` qui inclut aussi ce qui
    // est déjà dépensé.
    let remaining = 0;

    for (const key of keys) {
      const currentEntries = currentEntriesByCategory.get(key) ?? [];
      const spent = currentEntries.reduce((sum, entry) => sum + Math.abs(entry.amount), 0);

      let projected = spent;
      if (fixedExpenseIds.has(key)) {
        const expectedRemaining = expectedRemainingForFixedExpense(previousEntriesByCategory.get(key) ?? [], currentEntries);
        projected += expectedRemaining;
        remaining += expectedRemaining;
      }

      perCategory.set(key, projected);
      total += projected;
    }

    return { perCategory, total, remaining };
  }

  /**
   * Revenu du mois : le salaire tombe en général en toute fin de mois, donc
   * au moment de consulter le budget du mois en cours celui-ci n'est
   * généralement pas encore arrivé — le compter à zéro sous-estimerait
   * fortement le revenu disponible. On se base plutôt sur le salaire du mois
   * précédent, systématiquement, qu'un salaire soit ou non déjà tombé ce
   * mois-ci (pas de logique de "déjà passé ou pas" comme pour les dépenses
   * fixes — juste le mois précédent, toujours). Les autres revenus
   * (allocations, remboursements...) restent comptés tels que réellement
   * perçus ce mois-ci.
   */
  private async projectedTotalIncome(userId: string, range: MonthRange): Promise<number> {
    const salaryCategoryId = await this.categorization.salaryCategoryId();
    if (!salaryCategoryId) {
      const { total } = await this.sumWhere(userId, range.start, range.end, '>');
      return total;
    }

    const previousRange = previousMonthRange(range);
    const [otherIncome, previousSalary] = await Promise.all([
      this.sumIncomeByCategory(userId, range.start, range.end, salaryCategoryId, 'exclude'),
      this.sumIncomeByCategory(userId, previousRange.start, previousRange.end, salaryCategoryId, 'only'),
    ]);
    return otherIncome + previousSalary;
  }

  /** Somme des soldes actuels connus (comptes avec référence renseignée) ; null si aucun. */
  private async totalKnownCurrentBalance(userId: string): Promise<number | null> {
    const accounts = await this.accounts.findAllForUser(userId);
    const known = accounts.filter((account) => account.currentBalance !== null);
    if (known.length === 0) return null;
    return known.reduce((sum, account) => sum + (account.currentBalance as number), 0);
  }

  private async sumIncomeByCategory(
    userId: string,
    start: string,
    end: string,
    categoryId: string,
    filter: 'only' | 'exclude',
  ): Promise<number> {
    const qb = this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', { start, end })
      .andWhere('t.amount > 0');

    if (filter === 'only') {
      qb.andWhere('t.categoryId = :categoryId', { categoryId });
    } else {
      qb.andWhere('(t.categoryId != :categoryId OR t.categoryId IS NULL)', { categoryId });
    }

    const row = await qb.getRawOne<{ total: string }>();
    return parseFloat(row?.total ?? '0');
  }

  private async sumWhere(
    userId: string,
    start: string,
    end: string,
    comparator: '>' | '<',
  ): Promise<{ total: number }> {
    const row = await this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', { start, end })
      .andWhere(`t.amount ${comparator} 0`)
      .getRawOne<{ total: string }>();
    return { total: parseFloat(row?.total ?? '0') };
  }
}
