import { z } from 'zod';
import { alertRuleInputSchema, assertUniqueAlertRuleTypes } from '../watches/create-watch.js';

/**
 * SPEC-014 §"Contrato de API": só o que a `FlightSearch` de origem não já
 * captura (regras de alerta e canal de notificação) — o resto do
 * `CreateWatchRequest` é montado no código a partir da busca persistida.
 */
export const deriveWatchFromOfferRequestSchema = z
  .object({
    alertRules: z.array(alertRuleInputSchema).min(1).max(4),
    notificationChannelId: z.string().uuid(),
  })
  .strict()
  .superRefine((data, ctx) => assertUniqueAlertRuleTypes(data.alertRules, ctx));

export type DeriveWatchFromOfferRequest = z.infer<typeof deriveWatchFromOfferRequestSchema>;
