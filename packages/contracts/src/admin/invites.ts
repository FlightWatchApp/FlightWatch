import { z } from 'zod';
import { emailSchema } from '../auth/register.js';

export const inviteStateSchema = z.enum(['AVAILABLE', 'REDEEMED', 'REVOKED', 'EXPIRED']);
export type InviteState = z.infer<typeof inviteStateSchema>;

/** `POST /v1/admin/invites` */
export const createInviteRequestSchema = z
  .object({
    email: emailSchema,
    ttlDays: z.number().int().min(1).max(90).optional(),
  })
  .strict();
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

/** Nunca carrega a chave nem o hash. `state` é derivado: AVAILABLE vencida vira EXPIRED. */
export const inviteSchema = z.object({
  id: z.guid(),
  email: z.string(),
  state: inviteStateSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  redeemedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type InviteView = z.infer<typeof inviteSchema>;

/** `code` (formatado em grupos de 5) só existe nesta resposta e na de reenvio. */
export const createInviteResponseSchema = z.object({
  invite: inviteSchema,
  code: z.string(),
  emailSent: z.boolean(),
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

export const resendInviteResponseSchema = createInviteResponseSchema;
export type ResendInviteResponse = CreateInviteResponse;

export const revokeInviteResponseSchema = z.object({ invite: inviteSchema });
export type RevokeInviteResponse = z.infer<typeof revokeInviteResponseSchema>;

/** `GET /v1/admin/invites` — cursor = id da última linha da página anterior. */
export const listInvitesQuerySchema = z
  .object({
    state: inviteStateSchema.optional(),
    cursor: z.guid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListInvitesQuery = z.infer<typeof listInvitesQuerySchema>;

export const listInvitesResponseSchema = z.object({
  items: z.array(inviteSchema),
  nextCursor: z.string().nullable(),
});
export type ListInvitesResponse = z.infer<typeof listInvitesResponseSchema>;
