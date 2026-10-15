import { z } from 'zod';

/**
 * SPEC-014 §"Contrato de API": só o que a `FlightSearch` de origem não já
 * captura (o canal de notificação) — o resto do `CreateWatchRequest` é montado
 * no código a partir da busca persistida. SPEC-039: sem `alertRules`; a API
 * cria a regra de preço baixo.
 */
export const deriveWatchFromOfferRequestSchema = z
  .object({
    notificationChannelId: z.string().uuid(),
  })
  .strict();

export type DeriveWatchFromOfferRequest = z.infer<typeof deriveWatchFromOfferRequestSchema>;
