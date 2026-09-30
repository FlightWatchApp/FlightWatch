import { z } from 'zod';

const userStatusSchema = z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'DELETED']);

/**
 * `notificationChannelId` não é, a rigor, dado de autenticação — é aqui porque
 * SPEC-007 §6 cria um canal junto do registro, e o frontend precisa desse id
 * pra submeter um Watch (SPEC-001) sem depender de mais nenhuma constante fixa
 * de desenvolvimento. Ver ADR-006 e a nota de escopo em SPEC-007 §1.
 *
 * `notificationChannelVerified` (SPEC-010): sem isso o frontend não tem como
 * saber se deve mostrar o aviso de "confirme seu e-mail" sem uma chamada
 * separada. `false` quando não há canal nenhum.
 */
export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: userStatusSchema,
  notificationChannelId: z.string().uuid().nullable(),
  notificationChannelVerified: z.boolean(),
});

export const authSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: authenticatedUserSchema,
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
