import { z } from 'zod';

export const verifyEmailRequestSchema = z
  .object({
    token: z.string().trim().min(1),
  })
  .strict();

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const verifyEmailResponseSchema = z.object({
  status: z.literal('verified'),
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
