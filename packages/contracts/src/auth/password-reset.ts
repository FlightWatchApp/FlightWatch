import { z } from 'zod';
import { emailSchema, passwordSchema } from './register.js';

/** SPEC-026: resposta sempre 202, exista a conta ou não. */
export const passwordResetRequestSchema = z.object({ email: emailSchema }).strict();
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().trim().min(1),
    password: passwordSchema,
  })
  .strict();
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
