import { z } from 'zod';
import { coordinatesSchema } from '../places/places.js';
import { fareSummaryViewSchema } from '../shared/fare-summary.js';
import { iataCodeSchema, isoDateSchema } from '../shared/trip-fields.js';

export const dealTypeSchema = z.enum(['HISTORICAL_LOW', 'PERCENTAGE_BELOW_REFERENCE']);
export const dealConfidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

const opportunityOfferSegmentSchema = z.object({
  originIata: z.string(),
  destinationIata: z.string(),
  departureAt: z.string(),
  arrivalAt: z.string(),
  carrier: z.string(),
});

/** SPEC-015 §"Contrato de API": mesma projeção de oferta de SPEC-018's `currentOffer`. */
export const opportunityOfferSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
  purchaseUrl: z.string().url().nullable(),
  provider: z.string(),
  observedAt: z.string(),
  expiresAt: z.string().nullable(),
  status: z.enum(['CURRENT', 'EXPIRED']),
  segments: z.array(opportunityOfferSegmentSchema),
  // SPEC-030: preenchido (e `segments` vazio) quando a oferta é um resumo de tarifa.
  fareSummary: fareSummaryViewSchema.nullable(),
  durationMinutes: z.number().int().nullable(),
  connectionsCount: z.number().int(),
});

/**
 * SPEC-015 §"Comportamento de domínio": `Deal` nunca é persistido — este
 * schema descreve uma classificação computada na leitura, não uma linha de
 * banco. `explanation` é sempre uma string em português pronta pra exibir
 * (montada no serviço da API, não no domínio nem no frontend).
 */
export const dealSchema = z.object({
  dealType: dealTypeSchema,
  referenceAmountMinor: z.number().int(),
  currentAmountMinor: z.number().int(),
  currency: z.string(),
  dropPercent: z.number().nullable(),
  confidence: dealConfidenceSchema,
  observationCount: z.number().int(),
  explanation: z.string(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
});

export const opportunityItemSchema = z.object({
  searchTargetId: z.string().uuid(),
  origin: z.string(),
  destination: z.string(),
  // SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro.
  originName: z.string().nullable(),
  destinationName: z.string().nullable(),
  originCoordinates: coordinatesSchema,
  destinationCoordinates: coordinatesSchema,
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
  market: z.string(),
  departureDate: z.string(),
  returnDate: z.string().nullable(),
  deal: dealSchema,
  offer: opportunityOfferSchema,
});

export type OpportunityItem = z.infer<typeof opportunityItemSchema>;

export const listOpportunitiesQuerySchema = z.object({
  origin: iataCodeSchema.optional(),
  destination: iataCodeSchema.optional(),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']).optional(),
  departureDateFrom: isoDateSchema.optional(),
  departureDateTo: isoDateSchema.optional(),
  maxPriceMinor: z.coerce.number().int().positive().optional(),
  maxStops: z.coerce.number().int().min(0).max(3).optional(),
  dealType: dealTypeSchema.optional(),
  sort: z
    .enum(['best_value', 'lowest_price', 'most_recent', 'shortest_duration'])
    .default('best_value'),
});

export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;

export const listOpportunitiesResponseSchema = z.object({
  opportunities: z.array(opportunityItemSchema),
  total: z.number().int(),
});

export type ListOpportunitiesResponse = z.infer<typeof listOpportunitiesResponseSchema>;
