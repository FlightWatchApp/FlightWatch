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

/**
 * SPEC-039: resumo do alerta de preço baixo, calculado pela API (o web não
 * refaz a regra). null para Watch sem a regra `LOW_PRICE` ativa.
 */
export const watchLowPriceSchema = z.object({
  /** Quanto abaixo do preço normal dispara (inteiro, fixado na regra). */
  dropPercent: z.number().int(),
  /** Preço normal; null sem histórico próprio suficiente nem linha de base. */
  typicalAmountMinor: z.number().int().nullable(),
  typicalSource: z.enum(['HISTORY', 'NEARBY_DATES']).nullable(),
  /** Maior preço que ainda conta como "bem abaixo do normal". */
  thresholdAmountMinor: z.number().int().nullable(),
  /** Menor preço já observado da viagem nos últimos 90 dias. */
  lowestAmountMinor: z.number().int().nullable(),
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
  lowPrice: watchLowPriceSchema.nullable(),
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
  // Checklist pré-lançamento #2: paginação por cursor; null = última página.
  nextCursor: z.string().nullable(),
});

export const listWatchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(64).optional(),
});
export type ListWatchesQuery = z.infer<typeof listWatchesQuerySchema>;

export type CurrentOffer = z.infer<typeof currentOfferSchema>;
export type WatchLowPrice = z.infer<typeof watchLowPriceSchema>;
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
