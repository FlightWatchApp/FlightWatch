import { z } from 'zod';
import { promotionHighlightSchema } from '../promotions/list-promotions.js';
import { iataCodeSchema } from '../shared/trip-fields.js';
import { watchListItemSchema } from '../watches/list-watches.js';

/** SPEC-040: `PATCH /v1/me` — a cidade de partida da conta (null apaga). */
export const updateMeRequestSchema = z.object({ homeCityCode: iataCodeSchema.nullable() }).strict();

export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

const cityRefSchema = z.object({ code: z.string(), name: z.string() });

export const updateMeResponseSchema = z.object({ homeCity: cityRefSchema.nullable() });
export type UpdateMeResponse = z.infer<typeof updateMeResponseSchema>;

/**
 * SPEC-040: `GET /v1/me/overview` — tudo que os painéis pessoais precisam numa
 * chamada, só de banco e cache (nunca a fonte de preços). Só números que o
 * sistema sabe: nada de compra nem economia realizada.
 */
export const meOverviewResponseSchema = z.object({
  homeCity: cityRefSchema.nullable(),
  /** Watches `ACTIVE`. */
  activeCount: z.number().int(),
  /** Alertas que chegaram à pessoa (`NOTIFIED`). */
  alertsSent: z.number().int(),
  /** Watches ativos com preço no limite de "bem abaixo do normal" (SPEC-039). */
  belowTypicalNow: z.number().int(),
  /** Maior distância entre o preço normal e um preço avisado; null sem alerta de preço baixo. */
  biggestDrop: z
    .object({
      amountMinor: z.number().int(),
      percent: z.number().int(),
      currency: z.string(),
      origin: cityRefSchema,
      destination: cityRefSchema,
      departureDate: z.string(),
    })
    .nullable(),
  /** Até 3 ativos ou pausados, os abaixo do normal primeiro. */
  activeWatches: z.array(watchListItemSchema).max(3),
  /** Quantos ativos ou pausados existem ao todo (para "Ver todos"). */
  watchCount: z.number().int(),
  /** Até 3 promoções em cache chegando num destino da pessoa. */
  destinationPromotions: z.array(promotionHighlightSchema).max(3),
});

export type MeOverviewResponse = z.infer<typeof meOverviewResponseSchema>;
