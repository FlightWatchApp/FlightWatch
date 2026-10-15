import { z } from 'zod';
import { captchaTokenSchema } from './captcha.js';
import { type AuthSessionResponse, authSessionResponseSchema } from './session.js';

const emailSchema = z.string().trim().toLowerCase().email();

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    // Validação de forma apenas — a verificação real é contra o hash armazenado
    // (SPEC-007 §6), então não repetimos aqui os limites de política de senha
    // de registro (que podem mudar sem invalidar logins de senhas já existentes).
    password: z.string().min(1).max(256),
    // SPEC-041: token do Cloudflare Turnstile; exigido pela API só com o captcha ligado.
    captchaToken: captchaTokenSchema.optional(),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = authSessionResponseSchema;
export type LoginResponse = AuthSessionResponse;
