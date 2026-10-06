import { z } from 'zod';

/**
 * SPEC-027: confirmação por senha. Sem a regra de tamanho do cadastro — a
 * senha atual é conferida contra o hash, qualquer que seja.
 */
export const deleteAccountRequestSchema = z
  .object({ password: z.string().min(1).max(256) })
  .strict();
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;
