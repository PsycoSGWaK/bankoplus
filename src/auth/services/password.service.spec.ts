import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password and verifies it successfully', async () => {
    const hash = await service.hash('Sup3r$ecretPassw0rd!');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'Sup3r$ecretPassw0rd!')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('Sup3r$ecretPassw0rd!');
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});
