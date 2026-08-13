import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Budget } from './entities/budget.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CategorizationService } from '../transactions/categorization.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { SimulatePurchaseDto } from './dto/simulate-purchase.dto';
import { MonthRange, resolveMonthRange } from './utils/month-range.util';
import { projectCategorySpend, projectMonthEnd } from './utils/projection.util';
import { detectRecurringCategories, shiftMonth } from './utils/recurrence.util';

const UNCATEGORIZED_KEY = 'UNCATEGORIZED';
const RECURRENCE_MONTHS_BACK = 3;

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

    const [{ total: totalIncome }, { total: totalExpensesRaw }, projection] = await Promise.all([
      this.sumWhere(userId, range.start, range.end, '>'),
      this.sumWhere(userId, range.start, range.end, '<'),
      this.projectExpensesByCategory(userId, range),
    ]);
    const totalExpenses = Math.abs(totalExpensesRaw);
    const projectedExpensesMonthEnd = projection.total;

    return {
      month: `${range.year}-${String(range.month).padStart(2, '0')}`,
      daysElapsed: range.daysElapsed,
      daysInMonth: range.daysInMonth,
      isCurrentMonth: range.isCurrentMonth,
      totalIncome,
      totalExpenses,
      projectedExpensesMonthEnd,
      projectedBalance: totalIncome - projectedExpensesMonthEnd,
    };
  }

  async simulate(userId: string, dto: SimulatePurchaseDto) {
    const range = resolveMonthRange();
    const key = dto.categoryId ?? 'GLOBAL';

    const [spentByCategory, budget, recurringAverages] = await Promise.all([
      this.sumExpensesByCategory(userId, range.start, range.end),
      dto.categoryId
        ? this.budgets.findOne({ where: { userId, categoryId: dto.categoryId } })
        : this.budgets.findOne({ where: { userId, categoryId: IsNull() } }),
      this.recurringAveragesByCategory(userId, range),
    ]);

    const spentBefore = spentByCategory.get(key) ?? 0;
    const spentAfter = spentBefore + dto.amount;
    // Une simulation sur le budget global n'a pas de moyenne récurrente
    // propre (c'est une agrégation, pas une catégorie) : elle reste
    // extrapolée linéairement, comme avant.
    const recurringAverage = dto.categoryId ? recurringAverages.get(dto.categoryId) : undefined;
    const projectedMonthEndAfter = projectCategorySpend(
      spentAfter,
      range.daysElapsed,
      range.daysInMonth,
      recurringAverage,
    );

    return {
      categoryId: dto.categoryId ?? null,
      amount: dto.amount,
      spentBeforePurchase: spentBefore,
      spentAfterPurchase: spentAfter,
      projectedMonthEndAfterPurchase: projectedMonthEndAfter,
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

  /** Comme sumExpensesByCategory, mais sans la clé agrégée 'GLOBAL' — pour raisonner catégorie par catégorie. */
  private async sumExpensesByActualCategory(userId: string, start: string, end: string): Promise<Map<string, number>> {
    const rows = await this.expenseRowsByCategory(userId, start, end);
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.categoryId ?? UNCATEGORIZED_KEY, Math.abs(parseFloat(row.total)));
    }
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

  /** Historique mensuel des dépenses par catégorie sur les mois complets précédant `range`. */
  private async recentMonthlyCategoryTotals(userId: string, range: MonthRange): Promise<Map<string, number[]>> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const months = Array.from({ length: RECURRENCE_MONTHS_BACK }, (_, i) =>
      shiftMonth(range.year, range.month, -(RECURRENCE_MONTHS_BACK - i)),
    );

    const monthlyMaps = await Promise.all(
      months.map(({ year, month }) => {
        // On ne se sert que de start/end ici, pas de daysElapsed — peu importe
        // que ce mois passé soit ou non "le mois en cours" selon resolveMonthRange.
        const monthRange = resolveMonthRange(`${year}-${pad(month)}`);
        return this.sumExpensesByActualCategory(userId, monthRange.start, monthRange.end);
      }),
    );

    const totals = new Map<string, number[]>();
    for (const monthMap of monthlyMaps) {
      for (const [categoryKey, total] of monthMap) {
        const arr = totals.get(categoryKey) ?? [];
        arr.push(total);
        totals.set(categoryKey, arr);
      }
    }
    return totals;
  }

  private async recurringAveragesByCategory(userId: string, range: MonthRange): Promise<Map<string, number>> {
    const monthlyTotals = await this.recentMonthlyCategoryTotals(userId, range);
    return detectRecurringCategories(monthlyTotals);
  }

  /**
   * Projection de fin de mois par catégorie : les catégories récurrentes
   * (voir recurrence.util.ts) projettent leur montant mensuel habituel, les
   * autres extrapolent linéairement le rythme du mois en cours. `total` est
   * la somme de ces projections, utilisée pour le budget global et l'overview.
   */
  private async projectExpensesByCategory(
    userId: string,
    range: MonthRange,
  ): Promise<{ perCategory: Map<string, number>; total: number }> {
    const [spentByCategory, recurringAverages] = await Promise.all([
      this.sumExpensesByActualCategory(userId, range.start, range.end),
      this.recurringAveragesByCategory(userId, range),
    ]);

    const keys = new Set([...spentByCategory.keys(), ...recurringAverages.keys()]);
    const perCategory = new Map<string, number>();
    let total = 0;

    for (const key of keys) {
      const spent = spentByCategory.get(key) ?? 0;
      const projected = projectCategorySpend(spent, range.daysElapsed, range.daysInMonth, recurringAverages.get(key));
      perCategory.set(key, projected);
      total += projected;
    }

    return { perCategory, total };
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
