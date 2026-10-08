import { z } from 'zod';
import { iataCodeSchema } from '../shared/trip-fields.js';

/**
 * SPEC-032: `GET /v1/promotions` — promoções a partir de uma origem,
 * calculadas sob demanda. Moeda BRL e mercado BR fixos na v1.
 */
export const PROMOTION_CURRENCY = 'BRL';
export const PROMOTION_MARKET = 'BR';
export const PROMOTION_LIST_MAX_LIMIT = 50;

export const listPromotionsQuerySchema = z
  .object({
    origin: iataCodeSchema,
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']).default('ONE_WAY'),
    scope: z.enum(['all', 'domestic', 'international']).default('all'),
    sort: z.enum(['score', 'price', 'discount']).default('score'),
    limit: z.coerce.number().int().min(1).max(PROMOTION_LIST_MAX_LIMIT).default(20),
  })
  .strict();

export type ListPromotionsQuery = z.infer<typeof listPromotionsQuerySchema>;

const coordinatesSchema = z.object({ latitude: z.number(), longitude: z.number() });

export const promotionItemSchema = z.object({
  destination: z.string(),
  destinationName: z.string(),
  destinationCoordinates: coordinatesSchema.nullable(),
  scope: z.enum(['DOMESTIC', 'INTERNATIONAL']),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
  departureDate: z.string(),
  returnDate: z.string().nullable(),
  price: z.object({ amountMinor: z.number().int(), currency: z.string() }),
  stops: z.number().int(),
  discountBps: z.number().int(),
  absoluteSavingMinor: z.number().int(),
  reference: z.object({
    amountMinor: z.number().int(),
    pointCount: z.number().int(),
    /** Meses (AAAA-MM) que entraram na referência. */
    months: z.array(z.string()),
    /** Texto pronto em pt-BR, conferível à mão contra o calendário da rota. */
    explanation: z.string(),
  }),
  /** Quando a fonte viu o preço: a idade é calculada a partir daqui. */
  observedAt: z.string(),
  score: z.number().int().min(0).max(100),
  scoreVersion: z.literal(1),
  purchaseUrl: z.string().nullable(),
});

export type PromotionItem = z.infer<typeof promotionItemSchema>;

/**
 * `DISABLED`: kill switch ligado (`PROMOTION_ENGINE_ENABLED=false`) — a tela
 * some com o bloco. `BUDGET_EXHAUSTED`: orçamento do dia esgotado e nenhuma
 * promoção em cache para a origem.
 */
export const PROMOTION_FEED_STATUSES = ['OK', 'BUDGET_EXHAUSTED', 'DISABLED'] as const;

export const listPromotionsResponseSchema = z.object({
  origin: z.string(),
  originName: z.string(),
  status: z.enum(PROMOTION_FEED_STATUSES),
  /** Quando o feed desta origem foi calculado. */
  generatedAt: z.string(),
  promotions: z.array(promotionItemSchema),
});

export type ListPromotionsResponse = z.infer<typeof listPromotionsResponseSchema>;
export type PromotionFeedStatus = ListPromotionsResponse['status'];
