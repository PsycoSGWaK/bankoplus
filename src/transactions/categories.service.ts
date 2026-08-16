import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CategoryRule } from './entities/category-rule.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCategoryRuleDto } from './dto/create-category-rule.dto';
import { CategorizationService } from './categorization.service';
import { normalizeText } from '../common/utils/normalize-text';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(CategoryRule) private readonly rules: Repository<CategoryRule>,
    private readonly categorization: CategorizationService,
  ) {}

  list(userId: string): Promise<Category[]> {
    return this.categorization.findVisibleCategories(userId);
  }

  create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.categories.save(
      this.categories.create({ ...dto, isFixedExpense: dto.isFixedExpense ?? false, userId }),
    );
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.assertOwned(userId, categoryId);
    category.isFixedExpense = dto.isFixedExpense;
    return this.categories.save(category);
  }

  async remove(userId: string, categoryId: string): Promise<void> {
    const category = await this.assertOwned(userId, categoryId);
    await this.categories.remove(category);
  }

  async addRule(userId: string, categoryId: string, dto: CreateCategoryRuleDto): Promise<CategoryRule> {
    // La catégorie doit être visible (par défaut ou perso), mais la règle
    // créée ici est toujours personnelle à l'utilisateur.
    await this.categorization.assertVisible(userId, categoryId);
    return this.rules.save(
      this.rules.create({ categoryId, keyword: normalizeText(dto.keyword), userId }),
    );
  }

  listRules(userId: string, categoryId: string): Promise<CategoryRule[]> {
    return this.rules.find({
      where: [
        { categoryId, userId: IsNull() },
        { categoryId, userId },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async removeRule(userId: string, ruleId: string): Promise<void> {
    const rule = await this.rules.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new NotFoundException('Règle introuvable');
    }
    if (rule.userId !== userId) {
      throw new ForbiddenException('Cette règle ne peut pas être supprimée');
    }
    await this.rules.remove(rule);
  }

  private async assertOwned(userId: string, categoryId: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException('Catégorie introuvable');
    }
    if (category.userId !== userId) {
      throw new ForbiddenException('Seules vos catégories personnalisées peuvent être supprimées');
    }
    return category;
  }
}
