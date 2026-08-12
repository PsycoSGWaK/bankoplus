import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { registerAndAuthenticate, AuthenticatedUser } from './support/auth-flow.helper';

describe('Solde de référence du compte (e2e)', () => {
  let app: INestApplication;
  let user: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    user = await registerAndAuthenticate(app, 'balance');
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.accessToken}` });

  it('reports currentBalance as null until a reference is set', async () => {
    const account = await request(app.getHttpServer())
      .post('/api/accounts')
      .set(auth())
      .send({ label: 'Compte sans référence' })
      .expect(201);

    expect(account.body.currentBalance).toBeNull();
  });

  it('rejects a reference balance without a reference date', async () => {
    await request(app.getHttpServer())
      .post('/api/accounts')
      .set(auth())
      .send({ label: 'Compte incomplet', referenceBalance: 100 })
      .expect(400);
  });

  it('computes currentBalance from the reference plus transactions since that date', async () => {
    const account = await request(app.getHttpServer())
      .post('/api/accounts')
      .set(auth())
      .send({ label: 'Compte avec référence' })
      .expect(201);
    const accountId = account.body.id;

    const csv = [
      'date;libelle;montant',
      '02/06/2025;CB DEPENSE 1;-50,00',
      '15/07/2025;CB DEPENSE 2;-30,00',
      '01/08/2026;VIREMENT SALAIRE;1500,00',
    ].join('\n');
    await request(app.getHttpServer())
      .post('/api/import')
      .set(auth())
      .field('accountId', accountId)
      .attach('file', Buffer.from(csv, 'utf8'), 'releve.csv')
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/accounts/${accountId}`)
      .set(auth())
      .send({ referenceBalance: 400, referenceDate: '2025-06-01' })
      .expect(200);

    expect(updated.body.currentBalance).toBe(1820);

    const list = await request(app.getHttpServer()).get('/api/accounts').set(auth()).expect(200);
    const found = list.body.find((a: any) => a.id === accountId);
    expect(found.currentBalance).toBe(1820);
  });

  it("rejects updating an account that belongs to someone else", async () => {
    const other = await registerAndAuthenticate(app, 'balance-other');
    const otherAccount = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ label: "Compte d'un autre" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/accounts/${otherAccount.body.id}`)
      .set(auth())
      .send({ referenceBalance: 100, referenceDate: '2026-01-01' })
      .expect(403);
  });
});
