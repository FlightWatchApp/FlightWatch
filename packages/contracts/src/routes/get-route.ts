import { z } from 'zod';
import { iataCodeSchema } from '../shared/trip-fields.js';

/**
 * SPEC-033: `GET /v1/routes/{origin}/{destination}` — tudo que a página da
 * rota precisa numa chamada só (lugares, fatos calculados, preços dos meses,
 * promoção em cache e link). Moeda BRL e mercado BR fixos, como na SPEC-032.
 */
export const ROUTE_CURRENCY = 'BRL';
export const ROUTE_MARKET = 'BR';

export const getRouteParamsSchema = z
  .object({ origin: iataCodeSchema, destination: iataCodeSchema })
  .strict();

export const getRouteQuerySchema = z
  .object({ tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']).default('ONE_WAY') })
  .strict();

export type GetRouteParams = z.infer<typeof getRouteParamsSchema>;
export type GetRouteQuery = z.infer<typeof getRouteQuerySchema>;

const routePlaceSchema = z.object({
  code: z.string(),
  name: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  /** Aeroportos comerciais da cidade no catálogo (SPEC-029). */
  airports: z.array(z.object({ code: z.string(), name: z.string() })),
});

const routeDaySchema = z.object({
  date: z.string(),
  amountMinor: z.number().int(),
  stops: z.number().int(),
  /** Quando a fonte viu o preço (SPEC-030). */
  observedAt: z.string(),
});

/**
 * `OK`: há preço. `NO_PRICES`: meses consultados, nenhum preço. `UPDATING`:
 * faltou consultar algum mês (orçamento ou Retry-After) — vai o que houver.
 * `UNAVAILABLE`: fonte fora e nada em cache.
 */
export const ROUTE_PRICE_STATUSES = ['OK', 'NO_PRICES', 'UPDATING', 'UNAVAILABLE'] as const;

export const getRouteResponseSchema = z.object({
  origin: routePlaceSchema,
  destination: routePlaceSchema,
  /** Calculada entre as coordenadas das cidades; null sem coordenadas. */
  distanceKm: z.number().int().nullable(),
  /** Estimativa de um voo direto hipotético; a tela diz "estimado". */
  estimatedDirectFlightMinutes: z.number().int().nullable(),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
  prices: z.object({
    status: z.enum(ROUTE_PRICE_STATUSES),
    /** Meses (AAAA-MM) consultados, a partir do atual. */
    months: z.array(z.string()),
    days: z.array(routeDaySchema),
    cheapest: routeDaySchema.nullable(),
    /** Mediana das datas mostradas — a linha tracejada do gráfico. */
    referenceMedianMinor: z.number().int().nullable(),
    currency: z.literal(ROUTE_CURRENCY),
  }),
  /** Só do feed de promoções já em cache da origem; a página nunca o calcula. */
  promotion: z
    .object({
      discountBps: z.number().int(),
      departureDate: z.string(),
      amountMinor: z.number().int(),
      explanation: z.string(),
    })
    .nullable(),
  /** Busca completa no site parceiro (allowlist + afiliado, superfície ROUTE). */
  allFlightsUrl: z.string().nullable(),
  generatedAt: z.string(),
});

export type GetRouteResponse = z.infer<typeof getRouteResponseSchema>;
export type RoutePriceStatus = GetRouteResponse['prices']['status'];
