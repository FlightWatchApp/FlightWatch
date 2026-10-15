import { z } from 'zod';
import { iataCodeSchema, isoDateSchema } from '../shared/trip-fields.js';
import { ROUTE_CURRENCY, routeDaySchema } from './get-route.js';

/** SPEC-038: `GET /v1/routes/{origin}/{destination}/offers/{date}` (só ida). */
export const getRouteOfferParamsSchema = z
  .object({ origin: iataCodeSchema, destination: iataCodeSchema, date: isoDateSchema })
  .strict();

export type GetRouteOfferParams = z.infer<typeof getRouteOfferParamsSchema>;

/**
 * `OK`: há preço para a data. `NO_PRICE`: meses consultados, nada para a
 * data. `UPDATING`: faltou consultar algum mês (orçamento ou Retry-After).
 * `UNAVAILABLE`: fonte fora e nada em cache.
 */
export const ROUTE_OFFER_STATUSES = ['OK', 'NO_PRICE', 'UPDATING', 'UNAVAILABLE'] as const;

export const routeOfferFlightSchema = z.object({
  carrierCode: z.string(),
  /** Nome no catálogo de companhias; null quando o código não tem cadastro. */
  carrierName: z.string().nullable(),
  flightNumber: z.string().nullable(),
  /** RFC 3339 com o fuso da origem. */
  departureAt: z.string(),
  originAirport: z.string(),
  destinationAirport: z.string(),
  durationMinutes: z.number().int().nullable(),
  stops: z.number().int(),
});

export const getRouteOfferResponseSchema = z.object({
  origin: z.object({ code: z.string(), name: z.string() }),
  destination: z.object({ code: z.string(), name: z.string() }),
  date: z.string(),
  status: z.enum(ROUTE_OFFER_STATUSES),
  /** Preço do calendário para a data (o mesmo do cartão); null sem preço. */
  price: routeDaySchema.nullable(),
  currency: z.literal(ROUTE_CURRENCY),
  /** Preços das datas próximas (gráfico), em ordem de data. */
  days: z.array(routeDaySchema),
  /** Mediana das outras datas próximas; null com poucas datas. */
  nearbyMedianMinor: z.number().int().nullable(),
  /** Promoção em cache para esta mesma data (SPEC-032); nunca calculada aqui. */
  promotion: z.object({ discountBps: z.number().int(), explanation: z.string() }).nullable(),
  /** Voo mais barato que a fonte viu no dia (SPEC-038 F1); null quando ela não informa. */
  flight: routeOfferFlightSchema.nullable(),
  /** Busca no site parceiro para a data (allowlist + afiliado). */
  purchaseUrl: z.string().nullable(),
  generatedAt: z.string(),
});

export type RouteOfferFlight = z.infer<typeof routeOfferFlightSchema>;
export type GetRouteOfferResponse = z.infer<typeof getRouteOfferResponseSchema>;
