import { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import request from 'supertest';

export interface AuthenticatedUser {
  email: string;
  accessToken: string;
  refreshCookie: string;
}

const PASSWORD = 'Sup3r$ecretPassw0rd!';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@banko.plus`;
}

/** Rejoue le parcours complet inscription -> MFA -> connexion, tel qu'un vrai client le ferait. */
export async function registerAndAuthenticate(
  app: INestApplication,
  emailPrefix = 'e2e',
): Promise<AuthenticatedUser> {
  const email = uniqueEmail(emailPrefix);
  const server = app.getHttpServer();

  const register = await request(server)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD })
    .expect(201);
  const mfaSetupToken = register.body.mfaSetupToken as string;

  const setup = await request(server)
    .post('/api/auth/mfa/setup')
    .set('Authorization', `Bearer ${mfaSetupToken}`)
    .expect(200);
  const secret = setup.body.secret as string;

  await request(server)
    .post('/api/auth/mfa/enable')
    .set('Authorization', `Bearer ${mfaSetupToken}`)
    .send({ code: authenticator.generate(secret) })
    .expect(200);

  const login = await request(server)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  const mfaChallengeToken = login.body.token as string;

  const verify = await request(server)
    .post('/api/auth/login/verify')
    .set('Authorization', `Bearer ${mfaChallengeToken}`)
    .send({ code: authenticator.generate(secret) })
    .expect(200);

  const setCookie = verify.headers['set-cookie'] as unknown as string[];
  const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='))!;

  return { email, accessToken: verify.body.accessToken as string, refreshCookie };
}
