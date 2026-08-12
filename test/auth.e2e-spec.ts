import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { registerAndAuthenticate } from './support/auth-flow.helper';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a second registration with the same email', async () => {
    const { email } = await registerAndAuthenticate(app, 'dup');

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Sup3r$ecretPassw0rd!' })
      .expect(409);
  });

  it('rejects a login with the wrong password without revealing whether the account exists', async () => {
    const { email } = await registerAndAuthenticate(app, 'wrongpw');

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'not-the-right-password' })
      .expect(401);

    expect(res.body.message).toBe('Identifiants invalides');
  });

  it('rejects an MFA challenge with a wrong TOTP code', async () => {
    const email = `mfa.${Date.now()}@banko.plus`;
    const password = 'Sup3r$ecretPassw0rd!';
    const server = app.getHttpServer();

    const register = await request(server).post('/api/auth/register').send({ email, password });
    const setupToken = register.body.mfaSetupToken as string;
    const setup = await request(server)
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${setupToken}`);
    await request(server)
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${setupToken}`)
      .send({ code: authenticator.generate(setup.body.secret) });

    const login = await request(server).post('/api/auth/login').send({ email, password });

    await request(server)
      .post('/api/auth/login/verify')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ code: '000000' })
      .expect(401);
  });

  it('rotates the refresh token and detects reuse by killing the whole session', async () => {
    const { refreshCookie } = await registerAndAuthenticate(app, 'refresh');
    const server = app.getHttpServer();

    const firstRefresh = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    const rotatedCookie = firstRefresh.headers['set-cookie'][0] as string;

    // Rejouer l'ancien refresh token (déjà utilisé) doit échouer...
    await request(server).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);

    // ...et révoquer toute la famille : même le token pourtant valide et
    // jamais utilisé qui en est issu doit désormais être rejeté aussi.
    await request(server).post('/api/auth/refresh').set('Cookie', rotatedCookie).expect(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    const { refreshCookie } = await registerAndAuthenticate(app, 'logout');
    const server = app.getHttpServer();

    await request(server).post('/api/auth/logout').set('Cookie', refreshCookie).expect(204);
    await request(server).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  it('rejects access to a protected route without a token', async () => {
    await request(app.getHttpServer()).get('/api/accounts').expect(401);
  });
});
