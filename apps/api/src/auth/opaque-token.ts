import { createHash, randomBytes } from 'node:crypto';

/**
 * Token opaco separado do hashing de senha (ADR-006): já tem 256 bits de
 * entropia via CSPRNG, então precisa só de um digest rápido pra lookup no
 * banco, não de um KDF lento — argon2 aqui rodaria em toda request autenticada.
 * Generalizado de `session-token.ts` (SPEC-010): mesma lógica serve para
 * token de sessão e para token de confirmação de e-mail — duas credenciais
 * opacas de posse, mesma forma, mesmo hashing.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
