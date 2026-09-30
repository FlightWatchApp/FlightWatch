import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hash.js';

describe('password-hash', () => {
  it('verifies a password against its own hash', async () => {
    const passwordHash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword(passwordHash, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const passwordHash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword(passwordHash, 'wrong-password')).resolves.toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(first).not.toBe(second);
  });

  it('never stores the plaintext password inside the hash', async () => {
    const passwordHash = await hashPassword('my-secret-password');
    expect(passwordHash).not.toContain('my-secret-password');
  });
});
