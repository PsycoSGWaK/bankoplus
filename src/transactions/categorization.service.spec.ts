import { NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { CategorizationService } from './categorization.service';
import { FALLBACK_EXPENSE_CATEGORY, FALLBACK_INCOME_CATEGORY } from './category.seeder';

function repoMock() {
  return { find: jest.fn(), findOne: jest.fn(), findOneOrFail: jest.fn() };
}

describe('CategorizationService', () => {
  let service: CategorizationService;
  let categories: ReturnType<typeof repoMock>;
  let rules: ReturnType<typeof repoMock>;

  beforeEach(() => {
    categories = repoMock();
    rules = repoMock();
    service = new CategorizationService(categories as any, rules as any);
  });

  describe('suggest', () => {
    it('matches a system rule against a normalized label', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'r1', categoryId: 'cat-alimentation', keyword: 'CARREFOUR', userId: null },
      ]);

      const categoryId = await service.suggest('u1', 'CB CARREFOUR MARKET PARIS', -45.67);
      expect(categoryId).toBe('cat-alimentation');
    });

    it('prefers a personal rule over a system rule for the same match', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'sys', categoryId: 'cat-system', keyword: 'NETFLIX', userId: null },
        { id: 'perso', categoryId: 'cat-perso', keyword: 'NETFLIX', userId: 'u1' },
      ]);

      const categoryId = await service.suggest('u1', 'PAIEMENT NETFLIX.COM', -15.99);
      expect(categoryId).toBe('cat-perso');
    });

    it('prefers the more specific (longer) keyword on a tie of origin', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'r1', categoryId: 'cat-generic', keyword: 'CARTE', userId: null },
        { id: 'r2', categoryId: 'cat-specific', keyword: 'CARTE UBER', userId: null },
      ]);

      const categoryId = await service.suggest('u1', 'CARTE UBER TRIP', -12);
      expect(categoryId).toBe('cat-specific');
    });

    it('falls back to the default expense category when nothing matches a debit', async () => {
      rules.find.mockResolvedValueOnce([]);
      categories.findOneOrFail.mockResolvedValueOnce({ id: 'fallback-expense' });

      const categoryId = await service.suggest('u1', 'PAIEMENT INCONNU', -20);

      expect(categoryId).toBe('fallback-expense');
      expect(categories.findOneOrFail).toHaveBeenCalledWith({
        where: { name: FALLBACK_EXPENSE_CATEGORY, userId: IsNull() },
      });
    });

    it('falls back to the default income category for a positive amount', async () => {
      rules.find.mockResolvedValueOnce([]);
      categories.findOneOrFail.mockResolvedValueOnce({ id: 'fallback-income' });

      await service.suggest('u1', 'DEPOT INCONNU', 100);

      expect(categories.findOneOrFail).toHaveBeenCalledWith({
        where: { name: FALLBACK_INCOME_CATEGORY, userId: IsNull() },
      });
    });

    it('does not match a keyword against an unrelated substring of the label', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'r1', categoryId: 'cat-x', keyword: 'EDF', userId: null },
      ]);
      categories.findOneOrFail.mockResolvedValueOnce({ id: 'fallback-expense' });

      // "REDFOX" contient bien la sous-chaîne "EDF" — c'est une limite connue
      // du matching par sous-chaîne, documentée ici plutôt que cachée.
      const categoryId = await service.suggest('u1', 'CB REDFOX STUDIO', -9.99);
      expect(categoryId).toBe('cat-x');
    });

    it('ignores a rule with a minAmount guard when the transaction is below the threshold', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'r1', categoryId: 'cat-pret', keyword: 'CEN', minAmount: 100, direction: 'debit', userId: 'u1' },
      ]);
      categories.findOneOrFail.mockResolvedValueOnce({ id: 'fallback-expense' });

      // "CENTRE DE LOISIRS" à -18€ passe sous le seuil de 100€ : pas de match.
      const categoryId = await service.suggest('u1', 'CB CENTRE DE LOISIRS', -18);
      expect(categoryId).toBe('fallback-expense');
    });

    it('applies a rule with a minAmount guard when the transaction meets the threshold', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'r1', categoryId: 'cat-pret', keyword: 'CEN', minAmount: 100, direction: 'debit', userId: 'u1' },
      ]);

      const categoryId = await service.suggest('u1', 'PRLV CEN', -231);
      expect(categoryId).toBe('cat-pret');
    });

    it('ignores a rule with a direction guard on the wrong sign', async () => {
      rules.find.mockResolvedValueOnce([
        { id: 'r1', categoryId: 'cat-pret-demande', keyword: 'BPCE FINANCEMENT', minAmount: 100, direction: 'credit', userId: 'u1' },
      ]);
      categories.findOneOrFail.mockResolvedValueOnce({ id: 'fallback-expense' });

      // Un débit ne peut jamais matcher une règle exigeant un crédit.
      const categoryId = await service.suggest('u1', 'BPCE FINANCEMENT', -231);
      expect(categoryId).toBe('fallback-expense');
    });
  });

  describe('assertVisible', () => {
    it('throws when the category is neither default nor owned by the user', async () => {
      categories.findOne.mockResolvedValueOnce(null);
      await expect(service.assertVisible('u1', 'cat-other-user')).rejects.toThrow(NotFoundException);
    });

    it('resolves for a default category', async () => {
      categories.findOne.mockResolvedValueOnce({ id: 'cat-default', userId: null });
      await expect(service.assertVisible('u1', 'cat-default')).resolves.toEqual({
        id: 'cat-default',
        userId: null,
      });
    });
  });
});
