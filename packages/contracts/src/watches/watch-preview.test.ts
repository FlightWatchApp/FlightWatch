import { describe, expect, it } from 'vitest';
import { watchPreviewQuerySchema } from './watch-preview.js';

const oneWay = {
  origin: 'SAO',
  destination: 'BSB',
  tripType: 'ONE_WAY',
  departureDate: '2027-01-20',
};

describe('watchPreviewQuerySchema (SPEC-039)', () => {
  it('aceita só ida sem volta e ida e volta com volta depois da ida', () => {
    expect(watchPreviewQuerySchema.safeParse(oneWay).success).toBe(true);
    expect(
      watchPreviewQuerySchema.safeParse({
        ...oneWay,
        tripType: 'ROUND_TRIP',
        returnDate: '2027-01-27',
      }).success,
    ).toBe(true);
  });

  it('recusa volta em só ida, falta de volta em ida e volta e volta antes da ida', () => {
    expect(watchPreviewQuerySchema.safeParse({ ...oneWay, returnDate: '2027-01-27' }).success).toBe(
      false,
    );
    expect(watchPreviewQuerySchema.safeParse({ ...oneWay, tripType: 'ROUND_TRIP' }).success).toBe(
      false,
    );
    expect(
      watchPreviewQuerySchema.safeParse({
        ...oneWay,
        tripType: 'ROUND_TRIP',
        returnDate: '2027-01-20',
      }).success,
    ).toBe(false);
  });
});
