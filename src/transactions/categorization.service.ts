import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Category, CategoryKind } from './entities/category.entity';
import { CategoryRule } from './entities/category-rule.entity';
import { normalizeText } from '../common/utils/normalize-text';
import { FALLBACK_EXPENSE_CATEGORY, FALLBACK_INCOME_CATEGORY } from './category.seeder';

@Injectable()
export class CategorizationService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(CategoryRule) private readonly rules: Repository<CategoryRule>,
  ) {}

  /** Retourne l'id de catégorie suggéré pour une transaction, jamais null. */
  async suggest(userId: string, label: string, amount: number): Promise<string> {
    const kind: CategoryKind = amount >= 0 ? 'income' : 'expense';
    const normalizedLabel = normalizeText(label);

    // Règles perso de l'utilisateur d'abord (plus spécifiques), puis règles
    // système. À égalité de priorité, le mot-clé le plus long l'emporte
    // (plus spécifique qu'un mot-clé court générique).
    const candidateRules = await this.rules.find({
      where: [{ userId }, { userId: IsNull() }],
    });

    const matches = candidateRules
      .filter((rule) => normalizedLabel.includes(rule.keyword))
      .filter((rule) => rule.minAmount == null || Math.abs(amount) >= rule.minAmount)
      .filter((rule) => {
        if (rule.direction === 'credit') return amount > 0;
        if (rule.direction === 'debit') return amount < 0;
        return true;
      })
      .sort((a, b) => {
        if (a.userId && !b.userId) return -1;
        if (!a.userId && b.userId) return 1;
        return b.keyword.length - a.keyword.length;
      });

    if (matches.length > 0) {
      return matches[0].categoryId;
    }

    return this.fallbackCategoryId(kind);
  }

  private async fallbackCategoryId(kind: CategoryKind): Promise<string> {
    const name = kind === 'expense' ? FALLBACK_EXPENSE_CATEGORY : FALLBACK_INCOME_CATEGORY;
    const category = await this.categories.findOneOrFail({ where: { name, userId: IsNull() } });
    return category.id;
  }

  /**
   * Ids des catégories "Non catégorisé" (dépense + revenu). C'est un sac
   * fourre-tout hétérogène par construction (tout ce qu'aucune règle ne
   * reconnaît) — son total peut sembler stable d'un mois sur l'autre par
   * coïncidence, mais ça ne représente pas une facture fixe. Sert à exclure
   * ces catégories de la détection de dépenses récurrentes (voir budgets).
   */
  async fallbackCategoryIds(): Promise<Set<string>> {
    const categories = await this.categories.find({
      where: [
        { name: FALLBACK_EXPENSE_CATEGORY, userId: IsNull() },
        { name: FALLBACK_INCOME_CATEGORY, userId: IsNull() },
      ],
    });
    return new Set(categories.map((category) => category.id));
  }

  /**
   * Ids des catégories visibles par l'utilisateur marquées "dépense fixe"
   * (loyer, énergie, assurance...). Sert à restreindre la détection de
   * dépenses récurrentes aux catégories que l'utilisateur (ou les défauts)
   * ont explicitement désignées comme telles, plutôt qu'à toute catégorie
   * statistiquement stable — voir budgets.
   */
  async fixedExpenseCategoryIds(userId: string): Promise<Set<string>> {
    const categories = await this.findVisibleCategories(userId);
    return new Set(categories.filter((category) => category.isFixedExpense).map((category) => category.id));
  }

  /** Catégories visibles par l'utilisateur : les catégories par défaut + les siennes. */
  findVisibleCategories(userId: string): Promise<Category[]> {
    return this.categories.find({
      where: [{ userId: IsNull() }, { userId }],
      order: { kind: 'ASC', name: 'ASC' },
    });
  }

  async assertVisible(userId: string, categoryId: string): Promise<Category> {
    const category = await this.categories.findOne({
      where: [
        { id: categoryId, userId: IsNull() },
        { id: categoryId, userId },
      ],
    });
    if (!category) {
      throw new NotFoundException('Catégorie introuvable');
    }
    return category;
  }
}
