import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { registerAndAuthenticate, AuthenticatedUser } from './support/auth-flow.helper';

function frenchDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

describe('Budgets / Analyse (e2e)', () => {
  let app: INestApplication;
  let user: AuthenticatedUser;
  let accountId: string;
  let alimentationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    user = await registerAndAuthenticate(app, 'budget');
    const account = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ label: 'Compte e2e budgets' })
      .expect(201);
    accountId = account.body.id;

    const categories = await request(app.getHttpServer())
      .get('/api/categories')
      .set('Authorization', `Bearer ${user.accessToken}`);
    alimentationId = categories.body.find((c: any) => c.name === 'Alimentation').id;

    // Deux achats Carrefour ce mois-ci (dates relatives pour rester dans le
    // mois en cours quel que soit le jour où le test tourne), qui doivent
    // atterrir dans "Alimentation" via la catégorisation automatique.
    const csv = [
      'date;libelle;montant',
      `${frenchDate(5)};CB CARREFOUR MARKET;-60,00`,
      `${frenchDate(2)};CB CARREFOUR MARKET;-45,00`,
    ].join('\n');

    await request(app.getHttpServer())
      .post('/api/import')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(csv, 'utf8'), 'releve.csv')
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.accessToken}` });

  it('sets a category budget and reports it as exceeded once spending passes it', async () => {
    await request(app.getHttpServer())
      .post('/api/budgets')
      .set(auth())
      .send({ categoryId: alimentationId, monthlyLimit: 50 })
      .expect(201);

    const list = await request(app.getHttpServer()).get('/api/budgets').set(auth()).expect(200);
    const budget = list.body.find((b: any) => b.categoryId === alimentationId);

    expect(budget.spent).toBe(105);
    expect(budget.isOverBudget).toBe(true);
    expect(budget.remaining).toBe(0);
  });

  it('upserts instead of duplicating when the same budget is set again', async () => {
    await request(app.getHttpServer())
      .post('/api/budgets')
      .set(auth())
      .send({ categoryId: alimentationId, monthlyLimit: 200 })
      .expect(201);

    const list = await request(app.getHttpServer()).get('/api/budgets').set(auth()).expect(200);
    const matching = list.body.filter((b: any) => b.categoryId === alimentationId);

    expect(matching).toHaveLength(1);
    expect(matching[0].monthlyLimit).toBe(200);
    expect(matching[0].isOverBudget).toBe(false);
  });

  it('flags a simulated purchase that would exceed the category budget', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/budgets/simulate')
      .set(auth())
      .send({ amount: 150, categoryId: alimentationId })
      .expect(201);

    expect(res.body.spentAfterPurchase).toBe(255);
    expect(res.body.wouldExceedBudget).toBe(true);
  });

  it('rejects setting a budget on a category that is not visible to the user', async () => {
    await request(app.getHttpServer())
      .post('/api/budgets')
      .set(auth())
      .send({ categoryId: '00000000-0000-0000-0000-000000000000', monthlyLimit: 10 })
      .expect(404);
  });

  it("reports month income and expenses in the overview", async () => {
    const res = await request(app.getHttpServer()).get('/api/budgets/overview').set(auth()).expect(200);
    expect(res.body.totalExpenses).toBe(105);
    expect(res.body.isCurrentMonth).toBe(true);
  });
});
