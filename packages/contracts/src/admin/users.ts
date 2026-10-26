import { z } from 'zod';

/** `GET /v1/admin/users` */
export const adminUserSchema = z.object({
  id: z.guid(),
  email: z.string(),
  createdAt: z.string(),
  emailVerified: z.boolean(),
  role: z.enum(['USER', 'ADMIN']),
  accessStatus: z.enum(['ACTIVE', 'SUSPENDED']),
  /** Cota própria; null = padrão do sistema. */
  monthlyWatchLimit: z.number().int().nullable(),
  /** Limite efetivo (própria ou padrão); null = sem limite (admin). */
  effectiveMonthlyLimit: z.number().int().nullable(),
  watchesCreatedThisMonth: z.number().int(),
  activeWatches: z.number().int(),
});
export type AdminUserView = z.infer<typeof adminUserSchema>;

export const listAdminUsersQuerySchema = z
  .object({
    cursor: z.guid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;

export const listAdminUsersResponseSchema = z.object({
  items: z.array(adminUserSchema),
  nextCursor: z.string().nullable(),
});
export type ListAdminUsersResponse = z.infer<typeof listAdminUsersResponseSchema>;

/** `PATCH /v1/admin/users/:id` — `monthlyWatchLimit: null` volta ao padrão. */
export const updateAdminUserRequestSchema = z
  .object({
    monthlyWatchLimit: z.number().int().min(1).max(1000).nullable().optional(),
    accessStatus: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .strict()
  .refine((value) => value.monthlyWatchLimit !== undefined || value.accessStatus !== undefined, {
    message: 'informe monthlyWatchLimit ou accessStatus',
  });
export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>;

export const updateAdminUserResponseSchema = z.object({ user: adminUserSchema });
export type UpdateAdminUserResponse = z.infer<typeof updateAdminUserResponseSchema>;
