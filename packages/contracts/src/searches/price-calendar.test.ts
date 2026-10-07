import { describe, expect, it } from 'vitest';
import { priceCalendarQuerySchema } from './price-calendar.js';

describe('priceCalendarQuerySchema (SPEC-031 AC-2)', () => {
  it('aceita só ida com padrões de moeda e mercado', () => {
    expect(
      priceCalendarQuerySchema.parse({ origin: 'sao', destination: 'NYC', month: '2026-11' }),
    ).toEqual({
      origin: 'SAO',
      destination: 'NYC',
      month: '2026-11',
      tripType: 'ONE_WAY',
      currency: 'BRL',
      market: 'BR',
    });
  });

  it('ida e volta exige a duração da viagem', () => {
    const base = { origin: 'SAO', destination: 'LIS', month: '2026-11', tripType: 'ROUND_TRIP' };
    expect(priceCalendarQuerySchema.safeParse(base).success).toBe(false);
    expect(priceCalendarQuerySchema.parse({ ...base, tripLengthDays: '7' }).tripLengthDays).toBe(7);
  });

  it.each([
    [{ month: '2026-13' }],
    [{ month: '2026-1' }],
    [{ destination: 'SAO' }],
    [{ tripLengthDays: '0' }],
    [{ extra: 'x' }],
  ])('recusa %j', (override) => {
    expect(
      priceCalendarQuerySchema.safeParse({
        origin: 'SAO',
        destination: 'NYC',
        month: '2026-11',
        ...override,
      }).success,
    ).toBe(false);
  });
});
