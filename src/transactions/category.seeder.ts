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
  // Facture fixe qui tombe en général une fois par mois (loyer, énergie,
  // assurance, prêt, télécom, abonnements) — sert au budget pour projeter le
  // montant récurrent habituel plutôt que d'extrapoler linéairement. Absent
  // = false (dépense variable, ex: Alimentation, Loisirs).
  isFixedExpense?: boolean;
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
  {
    name: 'Transport',
    kind: 'expense',
    keywords: ['SNCF', 'UBER', 'RATP', 'TOTAL', 'ESSO', 'BLABLACAR', 'TRAINLINE', 'NAVIGO'],
  },
  // Logement ne couvre que le loyer — les charges (énergie, assurance...) ont
  // leurs propres catégories ci-dessous.
  { name: 'Logement', kind: 'expense', keywords: ['LOYER'], isFixedExpense: true },
  {
    name: 'Énergie',
    kind: 'expense',
    keywords: ['EDF', 'ENGIE', 'GRDF', 'VEOLIA'],
    isFixedExpense: true,
  },
  {
    name: 'Assurances',
    kind: 'expense',
    keywords: ['ASSURANCE', 'AXA', 'MAIF', 'MACIF', 'ALLIANZ', 'MATMUT', 'GMF'],
    isFixedExpense: true,
  },
  // Organismes de crédit à la consommation, pas seulement immobilier.
  // 'CEN' est risqué (matche aussi "CENTRE DE LOISI"/"CENTRE DU CHATE") mais
  // le volume de vrais faux positifs constaté est minime — même compromis
  // assumé que EDF/REDFOX documenté plus haut.
  {
    name: 'Prêt',
    kind: 'expense',
    keywords: ['PRET', 'ECHEANCE PRET', 'CREDIT IMMOBILIER', 'CETELEM', 'COFIDIS', 'CEN'],
    isFixedExpense: true,
  },
  {
    name: 'Télécom',
    kind: 'expense',
    keywords: ['ORANGE', 'SFR', 'BOUYGUES TELECOM', 'FREE MOBILE', 'SOSH', 'RED BY SFR'],
    isFixedExpense: true,
  },
  {
    name: 'Loisirs',
    kind: 'expense',
    keywords: ['NETFLIX', 'SPOTIFY', 'CINEMA', 'STEAM', 'CANAL PLUS', 'CANAL SAT'],
  },
  { name: 'Santé', kind: 'expense', keywords: ['PHARMACIE', 'DOCTOLIB', 'MUTUELLE'] },
  // Abonnements logiciels / bancaires récurrents, hors télécom/loisirs déjà couverts ailleurs.
  {
    name: 'Abonnements',
    kind: 'expense',
    keywords: [
      'ABONNEMENT',
      'APPLE.COM',
      'COTISATIONS BANCAIRES',
      'FRAIS BANCAIRES',
      'ALLDEBRID',
      'OPENAI',
      'MISTRAL.AI',
      'SOUNDIIZ',
      'ANTHROPIC',
      'MEGA LIMITED',
    ],
    isFixedExpense: true,
  },
  { name: 'Non catégorisé (dépense)', kind: 'expense', keywords: [] },
];

const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { name: 'Salaire', kind: 'income', keywords: ['VIREMENT SALAIRE', 'SALAIRE'] },
  { name: 'Non catégorisé (revenu)', kind: 'income', keywords: [] },
];

export const FALLBACK_EXPENSE_CATEGORY = 'Non catégorisé (dépense)';
export const FALLBACK_INCOME_CATEGORY = 'Non catégorisé (revenu)';

const SEED_LOCK_NAME = 'bankoplus_category_seed';

@Injectable()
export class CategorySeeder implements OnModuleInit {
  private readonly logger = new Logger(CategorySeeder.name);

  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(CategoryRule) private readonly rules: Repository<CategoryRule>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Verrou nommé MySQL : plusieurs instances de l'app peuvent démarrer en
    // même temps (redémarrage, plusieurs process de test en parallèle...).
    // Sans lui, deux process peuvent tous les deux semer les mêmes
    // catégories/règles en double. Le seed lui-même est idempotent par
    // catégorie et par mot-clé, donc on peut le rejouer à chaque démarrage
    // sans risque — utile pour ajouter de nouveaux défauts sur une base déjà
    // seedée (ex: restructuration Énergie/Assurances/Prêt/Télécom).
    await this.categories.manager.query('SELECT GET_LOCK(?, 10)', [SEED_LOCK_NAME]);
    try {
      await this.seed();
    } finally {
      await this.categories.manager.query('SELECT RELEASE_LOCK(?)', [SEED_LOCK_NAME]);
    }
  }

  private async seed(): Promise<void> {
    const allDefaults = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
    const categoryByName = await this.ensureCategories(allDefaults);
    await this.ensureRules(allDefaults, categoryByName);
  }

  private async ensureCategories(defaults: DefaultCategory[]): Promise<Map<string, Category>> {
    const existing = await this.categories.find({ where: { userId: IsNull() } });
    const byName = new Map(existing.map((category) => [category.name, category]));

    for (const def of defaults) {
      const isFixedExpense = def.isFixedExpense ?? false;
      const existing = byName.get(def.name);
      if (!existing) {
        this.logger.log(`Seed de la catégorie par défaut manquante : ${def.name}`);
        const created = await this.categories.save(
          this.categories.create({ name: def.name, kind: def.kind, isFixedExpense, userId: null }),
        );
        byName.set(def.name, created);
      } else if (existing.isFixedExpense !== isFixedExpense) {
        this.logger.log(`Mise à jour du flag dépense fixe de ${def.name} : ${isFixedExpense}`);
        existing.isFixedExpense = isFixedExpense;
        await this.categories.save(existing);
      }
    }
    return byName;
  }

  private async ensureRules(defaults: DefaultCategory[], categoryByName: Map<string, Category>): Promise<void> {
    // Indexées par mot-clé (unique parmi les règles système par construction) :
    // permet de détecter à la fois "mot-clé jamais vu" (création) et
    // "mot-clé déjà présent mais sous une ancienne catégorie" (relocalisation
    // — ex: EDF vivait sous Logement avant l'ajout de la catégorie Énergie).
    const existingRules = await this.rules.find({ where: { userId: IsNull() } });
    const ruleByKeyword = new Map(existingRules.map((rule) => [rule.keyword, rule]));

    for (const def of defaults) {
      const category = categoryByName.get(def.name)!;
      for (const rawKeyword of def.keywords) {
        const keyword = normalizeText(rawKeyword);
        const existingRule = ruleByKeyword.get(keyword);
        if (!existingRule) {
          const created = await this.rules.save(
            this.rules.create({ categoryId: category.id, keyword, userId: null }),
          );
          ruleByKeyword.set(keyword, created);
        } else if (existingRule.categoryId !== category.id) {
          this.logger.log(`Relocalisation de la règle "${keyword}" vers ${def.name}`);
          existingRule.categoryId = category.id;
          await this.rules.save(existingRule);
        }
      }
    }
  }
}
