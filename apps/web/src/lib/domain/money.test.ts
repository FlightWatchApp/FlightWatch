import { describe, expect, it } from 'vitest';
import { computeDisplayDropPercent, formatMoney, formatPercent } from './money';

describe('formatMoney', () => {
  it('formats BRL minor units as currency', () => {
    expect(formatMoney({ amountMinor: 97000, currency: 'BRL' })).toBe('R$ 970,00');
  });

  it('formats USD minor units as currency', () => {
    expect(formatMoney({ amountMinor: 12345, currency: 'USD' }, 'en-US')).toBe('$123.45');
  });
});

describe('formatPercent', () => {
  it('appends the percent sign with at most one decimal', () => {
    expect(formatPercent(15)).toBe('15%');
    expect(formatPercent(12.345)).toBe('12,3%');
  });
});

describe('computeDisplayDropPercent', () => {
  it('computes the percentage drop between reference and current amounts', () => {
    expect(computeDisplayDropPercent(100000, 80000)).toBe(20);
  });

  it('returns 0 when the reference amount is not positive', () => {
    expect(computeDisplayDropPercent(0, 100)).toBe(0);
  });
});
