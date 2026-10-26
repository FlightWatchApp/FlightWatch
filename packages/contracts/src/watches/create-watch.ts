import { z } from 'zod';
import { applyTripInvariants } from '../shared/trip-validation.js';
import {
  currencyCodeSchema,
  iataCodeSchema,
  isoDateSchema,
  marketCodeSchema,
} from '../shared/trip-fields.js';

export const createWatchRequestSchema = z
  .object({
    origin: iataCodeSchema,
    destination: iataCodeSchema,
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
    departureDate: isoDateSchema,
    returnDate: isoDateSchema.nullable(),
    cabin: z.literal('ECONOMY'),
    adults: z.literal(1),
    currency: currencyCodeSchema,
    market: marketCodeSchema,
    notificationChannelId: z.guid(),
  })
  // SPEC-039: sem `alertRules` — a API cria sempre a regra de preço baixo. Campo
  // desconhecido (inclusive `alertRules`) é recusado pelo `.strict()`.
  .strict()
  .superRefine((data, ctx) => applyTripInvariants(data, ctx));

export type CreateWatchRequest = z.infer<typeof createWatchRequestSchema>;

const watchStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'CANCELLED']);

export const createWatchResponseSchema = z.object({
  id: z.guid(),
  status: watchStatusSchema,
  search: z.object({
    origin: z.string(),
    destination: z.string(),
    // SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro.
    originName: z.string().nullable(),
    destinationName: z.string().nullable(),
    departureDate: z.string(),
    returnDate: z.string().nullable(),
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
    cabin: z.literal('ECONOMY'),
    adults: z.literal(1),
    currency: z.string(),
  }),
  alertRules: z.array(z.unknown()),
  lastObservation: z.null(),
  createdAt: z.string(),
});

export type CreateWatchResponse = z.infer<typeof createWatchResponseSchema>;
