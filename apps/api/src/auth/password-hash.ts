import { hash, verify } from '@node-rs/argon2';

/** Defaults da lib já batem com OWASP (Argon2id, 19 MiB, t=2, p=1) — SPEC-007 §15. */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  return verify(passwordHash, plain);
}
