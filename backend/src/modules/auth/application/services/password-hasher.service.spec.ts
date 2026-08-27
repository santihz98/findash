import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

  it('hashes a password and validates it back with compare()', async () => {
    const hash = await service.hash('CorrectHorseBatteryStaple');
    expect(hash).not.toBe('CorrectHorseBatteryStaple');
    await expect(service.compare('CorrectHorseBatteryStaple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password against a real hash', async () => {
    const hash = await service.hash('CorrectHorseBatteryStaple');
    await expect(service.compare('WrongPassword', hash)).resolves.toBe(false);
  });
});
