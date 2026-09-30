import { describe, expect, it } from 'vitest';
import { createFlightSearchRequestSchema } from './create-flight-search.js';

const validPayload = {
  origin: 'GRU',
  destination: 'DOU',
  tripType: 'ONE_WAY' as const,
  departureDate: '2026-12-20',
  returnDate: null,
  dateFlexibilityDays: 3,
  cabin: 'ECONOMY' as const,
  adults: 1 as const,
  currency: 'BRL',
  market: 'BR',
  maxStops: 1,
  maxPriceMinor: null,
};

describe('createFlightSearchRequestSchema', () => {
  it('accepts the exact SPEC-014 example payload', () => {
    expect(createFlightSearchRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = createFlightSearchRequestSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects origin equal to destination (shared trip invariant)', () => {
    const result = createFlightSearchRequestSchema.safeParse({
      ...validPayload,
      destination: validPayload.origin,
    });
    expect(result.success).toBe(false);
  });

  // SPEC-014: ANYWHERE fica fora de escopo desta fatia — cai no mesmo erro de
  // formato de qualquer IATA inválido, sem mensagem especial.
  it('rejects destination "ANYWHERE" (not a 3-letter IATA code)', () => {
    const result = createFlightSearchRequestSchema.safeParse({
      ...validPayload,
      destination: 'ANYWHERE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ONE_WAY carrying a returnDate (shared trip invariant)', () => {
    const result = createFlightSearchRequestSchema.safeParse({
      ...validPayload,
      tripType: 'ONE_WAY',
      returnDate: '2026-12-27',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a departureDate in the past (shared trip invariant)', () => {
    const result = createFlightSearchRequestSchema.safeParse({
      ...validPayload,
      departureDate: '2020-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('defaults maxStops/maxPriceMinor/dateFlexibilityDays when omitted', () => {
    const rest: Record<string, unknown> = { ...validPayload };
    delete rest.dateFlexibilityDays;
    delete rest.maxStops;
    delete rest.maxPriceMinor;
    const result = createFlightSearchRequestSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateFlexibilityDays).toBe(0);
      expect(result.data.maxStops).toBeNull();
      expect(result.data.maxPriceMinor).toBeNull();
    }
  });

  it.each([-1, 4])('rejects maxStops out of the 0-3 range: %d', (maxStops) => {
    expect(createFlightSearchRequestSchema.safeParse({ ...validPayload, maxStops }).success).toBe(
      false,
    );
  });

  it('rejects a non-positive maxPriceMinor', () => {
    const result = createFlightSearchRequestSchema.safeParse({
      ...validPayload,
      maxPriceMinor: 0,
    });
    expect(result.success).toBe(false);
  });
});
