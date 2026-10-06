import { z } from 'zod';
import { type AuthSessionResponse, authSessionResponseSchema } from './session.js';

/**
 * Limites de senha ainda não definidos pelo produto (SPEC-007 §5 só diz "10 a
 * 256 caracteres"). Placeholder alinhado a OWASP ASVS V2.1.1 (mínimo 8, aqui
 * 10) — ajustar quando o produto decidir uma política real de complexidade.
 */
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 256;

export const emailSchema = z.string().trim().toLowerCase().email();
/** Mesma regra no cadastro e na redefinição de senha (SPEC-026). */
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    timezone: z.string().trim().min(1),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const registerResponseSchema = authSessionResponseSchema;
export type RegisterResponse = AuthSessionResponse;
