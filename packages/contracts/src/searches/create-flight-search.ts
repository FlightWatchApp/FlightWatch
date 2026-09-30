import { z } from 'zod';
import { applyTripInvariants } from '../shared/trip-validation.js';
import {
  currencyCodeSchema,
  iataCodeSchema,
  isoDateSchema,
  marketCodeSchema,
} from '../shared/trip-fields.js';

/**
 * SPEC-014 §"Entradas e validação": `dateFlexibilityDays` é aceito e
 * validado, mas funcionalmente inerte nesta fatia — não existe consulta
 * multi-data ao provider ainda (a busca síncrona consulta uma única data).
 * `ANYWHERE` não é um valor aceito para `destination`: fora de escopo desta
 * fatia (depende do catálogo de `Destination`, SPEC-016), então um destino
 * inválido cai no mesmo erro 400 de formato que qualquer outro IATA inválido
 * — sem mensagem especial, para não prometer um recurso que não existe.
 */
export const createFlightSearchRequestSchema = z
  .object({
    origin: iataCodeSchema,
    destination: iataCodeSchema,
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
    departureDate: isoDateSchema,
    returnDate: isoDateSchema.nullable(),
    dateFlexibilityDays: z.number().int().min(0).max(7).default(0),
    cabin: z.literal('ECONOMY'),
    adults: z.literal(1),
    currency: currencyCodeSchema,
    market: marketCodeSchema,
    maxStops: z.number().int().min(0).max(3).nullable().default(null),
    maxPriceMinor: z.number().int().positive().nullable().default(null),
  })
  .strict()
  .superRefine((data, ctx) => applyTripInvariants(data, ctx));

export type CreateFlightSearchRequest = z.infer<typeof createFlightSearchRequestSchema>;

const flightSearchOfferSegmentSchema = z.object({
  originIata: z.string(),
  destinationIata: z.string(),
  departureAt: z.string(),
  arrivalAt: z.string(),
  carrier: z.string(),
});

/**
 * SPEC-014 §"Contrato de oferta". `purchaseUrl` é `null` quando o deep link
 * não passa na validação de host/esquema (mesma allowlist do SPEC-018) —
 * nunca uma URL não confiável. `availabilityStatus` reflete `expiresAt` no
 * momento da leitura, recalculado a cada resposta, nunca cacheado.
 */
export const flightSearchOfferSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  provider: z.string(),
  segments: z.array(flightSearchOfferSegmentSchema),
  totalAmountMinor: z.number().int(),
  currency: z.string(),
  passengerCount: z.number().int(),
  cabin: z.string(),
  durationMinutes: z.number().int(),
  connectionsCount: z.number().int(),
  observedAt: z.string(),
  expiresAt: z.string().nullable(),
  purchaseUrl: z.string().url().nullable(),
  availabilityStatus: z.enum(['CURRENT', 'EXPIRED']),
  qualityFlags: z.array(z.string()),
});

export type FlightSearchOffer = z.infer<typeof flightSearchOfferSchema>;

export const flightSearchStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'EXPIRED',
]);

export const flightSearchResponseSchema = z.object({
  id: z.string().uuid(),
  status: flightSearchStatusSchema,
  origin: z.string(),
  destination: z.string(),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
  departureDate: z.string(),
  returnDate: z.string().nullable(),
  cabin: z.literal('ECONOMY'),
  adults: z.literal(1),
  currency: z.string(),
  market: z.string(),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  offers: z.array(flightSearchOfferSchema),
});

export type FlightSearchResponse = z.infer<typeof flightSearchResponseSchema>;
