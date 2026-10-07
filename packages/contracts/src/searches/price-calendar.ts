import { z } from 'zod';
import { currencyCodeSchema, iataCodeSchema, marketCodeSchema } from '../shared/trip-fields.js';

/** SPEC-031: `GET /v1/price-calendar` — menor preço por dia de um mês. */
export const priceCalendarQuerySchema = z
  .object({
    origin: iataCodeSchema,
    destination: iataCodeSchema,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM'),
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']).default('ONE_WAY'),
    tripLengthDays: z.coerce.number().int().min(1).max(60).optional(),
    currency: currencyCodeSchema.default('BRL'),
    market: marketCodeSchema.default('BR'),
  })
  .strict()
  .refine((query) => query.tripType === 'ONE_WAY' || query.tripLengthDays !== undefined, {
    message: 'tripLengthDays is required for ROUND_TRIP',
    path: ['tripLengthDays'],
  })
  .refine((query) => query.origin !== query.destination, {
    message: 'origin and destination must differ',
    path: ['destination'],
  });

export type PriceCalendarQuery = z.infer<typeof priceCalendarQuerySchema>;

export const calendarDaySchema = z.object({
  date: z.string(),
  amountMinor: z.number().int(),
  stops: z.number().int(),
  observedAt: z.string(),
});

export const priceCalendarResponseSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  month: z.string(),
  currency: z.string(),
  days: z.array(calendarDaySchema),
});

export type PriceCalendarResponse = z.infer<typeof priceCalendarResponseSchema>;
export type CalendarDayView = z.infer<typeof calendarDaySchema>;
