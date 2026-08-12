import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Category, CategoryKind } from './entities/category.entity';
import { CategoryRule } from './entities/category-rule.entity';
import { normalizeText } from '../common/utils/normalize-text';

interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  keywords: string[];
}

// Catégories et mots-clés de démarrage — un utilisateur peut ajouter les
// siens par-dessus (voir CategoriesController). Non exhaustif par design :
// mieux vaut un utilisateur qui corrige une fois qu'une liste infinie de
// règles fragiles.
const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  {
    name: 'Alimentation',
    kind: 'expense',
    keywords: ['CARREFOUR', 'LECLERC', 'AUCHAN', 'MONOPRIX', 'INTERMARCHE', 'LIDL', 'FRANPRIX', 'CASINO'],
  },
  { name: 'Transport', kind: 'expense', keywords: ['SNCF', 'UBER', 'RATP', 'TOTAL', 'ESSO', 'BLABLACAR'] },
  { name: 'Logement', kind: 'expense', keywords: ['EDF', 'ENGIE', 'VEOLIA', 'LOYER'] },
  { name: 'Loisirs', kind: 'expense', keywords: ['NETFLIX', 'SPOTIFY', 'CINEMA', 'STEAM'] },
  { name: 'Santé', kind: 'expense', keywords: ['PHARMACIE', 'DOCTOLIB', 'MUTUELLE'] },
  { name: 'Abonnements', kind: 'expense', keywords: ['ABONNEMENT', 'ASSURANCE'] },
  { name: 'Non catégorisé (dépense)', kind: 'expense', keywords: [] },
];

const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { name: 'Salaire', kind: 'income', keywords: ['VIREMENT SALAIRE', 'SALAIRE'] },
  { name: 'Non catégorisé (revenu)', kind: 'income', keywords: [] },
];

export const FALLBACK_EXPENSE_CATEGORY = 'Non catégorisé (dépense)';
export const FALLBACK_INCOME_CATEGORY = 'Non catégorisé (revenu)';

@Injectable()
export class CategorySeeder implements OnModuleInit {
  private readonly logger = new Logger(CategorySeeder.name);

  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(CategoryRule) private readonly rules: Repository<CategoryRule>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existingDefaults = await this.categories.count({ where: { userId: IsNull() } });
    if (existingDefaults > 0) {
      return;
    }

    this.logger.log('Seed des catégories par défaut...');
    for (const def of [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]) {
      const category = await this.categories.save(
        this.categories.create({ name: def.name, kind: def.kind, userId: null }),
      );
      if (def.keywords.length > 0) {
        await this.rules.save(
          def.keywords.map((keyword) =>
            this.rules.create({ categoryId: category.id, keyword: normalizeText(keyword), userId: null }),
          ),
        );
      }
    }
  }
}
