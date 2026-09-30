import { describe, expect, it } from 'vitest';
import { createWatchRequestSchema } from './create-watch.js';

const validPayload = {
  origin: 'DOU',
  destination: 'GRU',
  tripType: 'ONE_WAY' as const,
  departureDate: '2026-12-20',
  returnDate: null,
  cabin: 'ECONOMY' as const,
  adults: 1 as const,
  currency: 'BRL',
  market: 'BR',
  alertRules: [{ type: 'TARGET_PRICE' as const, amountMinor: 80000, cooldownSeconds: 43200 }],
  notificationChannelId: '11111111-1111-1111-1111-111111111111',
};

describe('createWatchRequestSchema', () => {
  it('accepts the exact SPEC-001 §4 example', () => {
    expect(createWatchRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = createWatchRequestSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects origin equal to destination', () => {
    const result = createWatchRequestSchema.safeParse({ ...validPayload, destination: 'DOU' });
    expect(result.success).toBe(false);
  });

  it.each(['DO', 'DOUR', '123'])('rejects malformed IATA code: %s', (origin) => {
    expect(createWatchRequestSchema.safeParse({ ...validPayload, origin }).success).toBe(false);
  });

  it('rejects ONE_WAY carrying a returnDate', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      tripType: 'ONE_WAY',
      returnDate: '2026-12-27',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ROUND_TRIP missing a returnDate', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      tripType: 'ROUND_TRIP',
      returnDate: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a returnDate on or before departureDate', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      tripType: 'ROUND_TRIP',
      returnDate: '2026-12-20',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid ROUND_TRIP', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      tripType: 'ROUND_TRIP',
      returnDate: '2026-12-27',
    });
    expect(result.success).toBe(true);
  });

  it('rejects cabin other than ECONOMY', () => {
    const result = createWatchRequestSchema.safeParse({ ...validPayload, cabin: 'BUSINESS' });
    expect(result.success).toBe(false);
  });

  it('rejects adults other than 1 (MVP limit)', () => {
    const result = createWatchRequestSchema.safeParse({ ...validPayload, adults: 2 });
    expect(result.success).toBe(false);
  });

  it.each(['2020-01-01', '2026-09-18'])(
    'rejects a departureDate not in the future: %s',
    (departureDate) => {
      const result = createWatchRequestSchema.safeParse({ ...validPayload, departureDate });
      expect(result.success).toBe(false);
    },
  );

  // Regressão: o regex de formato sozinho aceitava datas que não existem —
  // "2026-02-30" virava silenciosamente "2026-03-02" via `new Date(...)`
  // (rollover, sem erro nenhum) em vez de ser rejeitada.
  it.each(['2027-02-30', '2027-04-31', '2027-13-01', '2027-00-15', '2027-01-32', '2027-01-00'])(
    'rejects a departureDate that is not a real calendar date: %s',
    (departureDate) => {
      const result = createWatchRequestSchema.safeParse({ ...validPayload, departureDate });
      expect(result.success).toBe(false);
    },
  );

  it('accepts a real leap-day departureDate and rejects the same day in a non-leap year', () => {
    const leapYear = createWatchRequestSchema.safeParse({
      ...validPayload,
      departureDate: '2028-02-29',
    });
    expect(leapYear.success).toBe(true);

    const nonLeapYear = createWatchRequestSchema.safeParse({
      ...validPayload,
      departureDate: '2027-02-29',
    });
    expect(nonLeapYear.success).toBe(false);
  });

  it('rejects zero alert rules', () => {
    const result = createWatchRequestSchema.safeParse({ ...validPayload, alertRules: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than four alert rules', () => {
    const rules = [
      { type: 'TARGET_PRICE' as const, amountMinor: 80000, cooldownSeconds: 43200 },
      { type: 'PERCENTAGE_DROP' as const, percent: 10, cooldownSeconds: 43200 },
      { type: 'ABSOLUTE_DROP' as const, dropAmountMinor: 10000, cooldownSeconds: 43200 },
      { type: 'NEW_OBSERVED_LOW' as const, cooldownSeconds: 43200 },
    ];
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      alertRules: [
        ...rules,
        { type: 'TARGET_PRICE' as const, amountMinor: 1, cooldownSeconds: 43200 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate alert rule types', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      alertRules: [
        { type: 'TARGET_PRICE', amountMinor: 80000, cooldownSeconds: 43200 },
        { type: 'TARGET_PRICE', amountMinor: 70000, cooldownSeconds: 43200 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID notificationChannelId', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      notificationChannelId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it.each([0, -1, 101])('rejects an out-of-range PERCENTAGE_DROP percent: %s', (percent) => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      alertRules: [{ type: 'PERCENTAGE_DROP', percent, cooldownSeconds: 43200 }],
    });
    expect(result.success).toBe(false);
  });

  it.each([0, 100, 3_000_000])('rejects an out-of-range cooldownSeconds: %s', (cooldownSeconds) => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      alertRules: [{ type: 'TARGET_PRICE', amountMinor: 80000, cooldownSeconds }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts each alert rule type on its own', () => {
    const cases = [
      { type: 'TARGET_PRICE' as const, amountMinor: 80000, cooldownSeconds: 43200 },
      { type: 'PERCENTAGE_DROP' as const, percent: 15, cooldownSeconds: 43200 },
      { type: 'ABSOLUTE_DROP' as const, dropAmountMinor: 10000, cooldownSeconds: 43200 },
      { type: 'NEW_OBSERVED_LOW' as const, cooldownSeconds: 43200 },
    ];
    for (const alertRule of cases) {
      const result = createWatchRequestSchema.safeParse({
        ...validPayload,
        alertRules: [alertRule],
      });
      expect(result.success).toBe(true);
    }
  });

  it('normalizes casing on IATA/currency/market codes', () => {
    const result = createWatchRequestSchema.safeParse({
      ...validPayload,
      origin: 'dou',
      destination: 'gru',
      currency: 'brl',
      market: 'br',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.origin).toBe('DOU');
      expect(result.data.currency).toBe('BRL');
    }
  });
});
