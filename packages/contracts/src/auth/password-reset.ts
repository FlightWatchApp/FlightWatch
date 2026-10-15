import { z } from 'zod';
import { captchaTokenSchema } from './captcha.js';
import { emailSchema, passwordSchema } from './register.js';

/** SPEC-026: resposta sempre 202, exista a conta ou não. */
export const passwordResetRequestSchema = z
  .object({
    email: emailSchema,
    // SPEC-041: token do Cloudflare Turnstile; exigido pela API só com o captcha ligado.
    captchaToken: captchaTokenSchema.optional(),
  })
  .strict();
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().trim().min(1),
    password: passwordSchema,
  })
  .strict();
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
