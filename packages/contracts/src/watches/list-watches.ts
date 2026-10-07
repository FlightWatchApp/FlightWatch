import { z } from 'zod';

/**
 * Sem SPEC própria ainda — PRODUCT.md §7.3 descreve o que a listagem precisa
 * mostrar (último preço, menor preço, última consulta, estado), mas não existe
 * um SPEC-00X formalizando o contrato. Este schema segue exatamente o que
 * §7.3 pede; se a spec for escrita depois, esse é o ponto a reconciliar.
 */
const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.string() });

/** SPEC-018 §"Contrato de API/evento/job". */
export const currentOfferSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
  purchaseUrl: z.string().url(),
  provider: z.string(),
  observedAt: z.string(),
  expiresAt: z.string().nullable(),
  status: z.enum(['CURRENT', 'EXPIRED']),
});

export const watchListItemSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'CANCELLED']),
  origin: z.string(),
  destination: z.string(),
  // SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro.
  originName: z.string().nullable(),
  destinationName: z.string().nullable(),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
  departureDate: z.string(),
  returnDate: z.string().nullable(),
  currency: z.string(),
  currentPrice: moneySchema.nullable(),
  lowestPrice: moneySchema.nullable(),
  targetAmountMinor: z.number().int().nullable(),
  lastCheck: z
    .object({
      at: z.string(),
      outcome: z.enum([
        'succeeded',
        'no_offers',
        'retryable_failure',
        'permanent_failure',
        'rate_limited',
      ]),
    })
    .nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  // SPEC-018: null quando não há observação ou o deep link não passa na
  // validação de host/esquema — nunca uma URL não confiável.
  currentOffer: currentOfferSchema.nullable(),
});

export const listWatchesResponseSchema = z.object({
  watches: z.array(watchListItemSchema),
});

export type CurrentOffer = z.infer<typeof currentOfferSchema>;
export type WatchListItem = z.infer<typeof watchListItemSchema>;
export type ListWatchesResponse = z.infer<typeof listWatchesResponseSchema>;

/** SPEC-009 §7. */
export const pricePointSchema = z.object({
  id: z.string().uuid(),
  observedAt: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
});

export const watchDetailResponseSchema = watchListItemSchema.extend({
  priceHistory: z.array(pricePointSchema),
});

export type PricePoint = z.infer<typeof pricePointSchema>;
export type WatchDetailResponse = z.infer<typeof watchDetailResponseSchema>;
