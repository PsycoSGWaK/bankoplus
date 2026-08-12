import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Budget } from './entities/budget.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CategorizationService } from '../transactions/categorization.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { SimulatePurchaseDto } from './dto/simulate-purchase.dto';
import { resolveMonthRange } from './utils/month-range.util';
import { projectMonthEnd } from './utils/projection.util';

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
    const [budgets, spentByCategory] = await Promise.all([
      this.budgets.find({ where: { userId } }),
      this.sumExpensesByCategory(userId, range.start, range.end),
    ]);

    return budgets.map((budget) => {
      const key = budget.categoryId ?? 'GLOBAL';
      const spent = spentByCategory.get(key) ?? 0;
      const projectedMonthEnd = projectMonthEnd(spent, range.daysElapsed, range.daysInMonth);

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

    const [{ total: totalIncome }, { total: totalExpensesRaw }] = await Promise.all([
      this.sumWhere(userId, range.start, range.end, '>'),
      this.sumWhere(userId, range.start, range.end, '<'),
    ]);
    const totalExpenses = Math.abs(totalExpensesRaw);
    const projectedExpensesMonthEnd = projectMonthEnd(totalExpenses, range.daysElapsed, range.daysInMonth);

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

    const [spentByCategory, budget] = await Promise.all([
      this.sumExpensesByCategory(userId, range.start, range.end),
      dto.categoryId
        ? this.budgets.findOne({ where: { userId, categoryId: dto.categoryId } })
        : this.budgets.findOne({ where: { userId, categoryId: IsNull() } }),
    ]);

    const spentBefore = spentByCategory.get(key) ?? 0;
    const spentAfter = spentBefore + dto.amount;
    const projectedMonthEndAfter = projectMonthEnd(spentAfter, range.daysElapsed, range.daysInMonth);

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
    const rows = await this.transactions
      .createQueryBuilder('t')
      .select('t.categoryId', 'categoryId')
      .addSelect('SUM(t.amount)', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', { start, end })
      .andWhere('t.amount < 0')
      .groupBy('t.categoryId')
      .getRawMany<{ categoryId: string | null; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.categoryId ?? 'GLOBAL', Math.abs(parseFloat(row.total)));
    }
    // Le seuil global agrège toutes les dépenses, pas seulement celles sans catégorie.
    const globalTotal = rows.reduce((sum, row) => sum + Math.abs(parseFloat(row.total)), 0);
    map.set('GLOBAL', globalTotal);
    return map;
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
