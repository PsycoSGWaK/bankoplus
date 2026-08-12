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
