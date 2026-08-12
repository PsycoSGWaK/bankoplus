import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { registerAndAuthenticate, AuthenticatedUser } from './support/auth-flow.helper';

describe('Import + Catégorisation automatique (e2e)', () => {
  let app: INestApplication;
  let user: AuthenticatedUser;
  let accountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    user = await registerAndAuthenticate(app, 'import');
    const account = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ label: 'Compte e2e' })
      .expect(201);
    accountId = account.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.accessToken}` });

  it('imports a CSV, auto-categorizes known merchants, and counts unparsable rows as failed', async () => {
    const csv = [
      'date;libelle;montant',
      '03/08/2026;CB CARREFOUR MARKET PARIS;-45,67',
      '01/08/2026;VIREMENT SALAIRE ENTREPRISE XYZ;1500,00',
      'ligne;cassee;',
    ].join('\n');

    const res = await request(app.getHttpServer())
      .post('/api/import')
      .set(auth())
      .field('accountId', accountId)
      .attach('file', Buffer.from(csv, 'utf8'), 'releve.csv')
      .expect(201);

    expect(res.body).toMatchObject({ status: 'partial', totalRows: 3, importedRows: 2, failedRows: 1 });

    const categories = await request(app.getHttpServer())
      .get('/api/categories')
      .set(auth())
      .expect(200);
    const byName = Object.fromEntries(categories.body.map((c: any) => [c.name, c.id]));

    const transactions = await request(app.getHttpServer())
      .get(`/api/transactions?accountId=${accountId}`)
      .set(auth())
      .expect(200);

    const carrefour = transactions.body.find((t: any) => t.label.includes('CARREFOUR'));
    const salaire = transactions.body.find((t: any) => t.label.includes('SALAIRE'));
    expect(carrefour.categoryId).toBe(byName['Alimentation']);
    expect(salaire.categoryId).toBe(byName['Salaire']);
  });

  it('rejects a file with a disallowed extension', async () => {
    await request(app.getHttpServer())
      .post('/api/import')
      .set(auth())
      .field('accountId', accountId)
      .attach('file', Buffer.from('hello'), 'notes.txt')
      .expect(400);
  });

  it("rejects importing into an account that belongs to someone else", async () => {
    const otherUser = await registerAndAuthenticate(app, 'other');
    const otherAccount = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${otherUser.accessToken}`)
      .send({ label: "Compte d'un autre" })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/import')
      .set(auth()) // le premier utilisateur essaie d'importer sur le compte du second
      .field('accountId', otherAccount.body.id)
      .attach('file', Buffer.from('date;libelle;montant\n01/08/2026;X;-1,00', 'utf8'), 'releve.csv')
      .expect(403);
  });

  it('lets the owner manually correct an auto-assigned category', async () => {
    const transactions = await request(app.getHttpServer())
      .get(`/api/transactions?accountId=${accountId}`)
      .set(auth())
      .expect(200);
    const target = transactions.body[0];

    const categories = await request(app.getHttpServer()).get('/api/categories').set(auth());
    const loisirs = categories.body.find((c: any) => c.name === 'Loisirs');

    const updated = await request(app.getHttpServer())
      .patch(`/api/transactions/${target.id}/category`)
      .set(auth())
      .send({ categoryId: loisirs.id })
      .expect(200);

    expect(updated.body.categoryId).toBe(loisirs.id);
  });
});
