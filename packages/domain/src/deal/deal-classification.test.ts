import { describe, expect, it } from 'vitest';
import { createMoney } from '../money/money.js';
import {
  MIN_OBSERVATIONS_FOR_REFERENCE,
  MIN_PERCENTAGE_BELOW_REFERENCE,
  classifyDeal,
} from './deal-classification.js';

const brl = (amountMinor: number) => createMoney(amountMinor, 'BRL');

describe('classifyDeal', () => {
  it('returns null dealType when observationCount is below the minimum', () => {
    const result = classifyDeal({
      currentAmount: brl(50_000),
      lowestEverAmount: brl(50_000),
      averageAmount: brl(50_000),
      observationCount: MIN_OBSERVATIONS_FOR_REFERENCE - 1,
    });
    expect(result).toEqual({
      dealType: null,
      referenceAmount: null,
      dropPercent: null,
      confidence: 'LOW',
    });
  });

  it('classifies HISTORICAL_LOW when current price equals the lowest ever seen', () => {
    const result = classifyDeal({
      currentAmount: brl(50_000),
      lowestEverAmount: brl(50_000),
      averageAmount: brl(80_000),
      observationCount: 10,
    });
    expect(result.dealType).toBe('HISTORICAL_LOW');
    expect(result.referenceAmount).toEqual(brl(50_000));
    expect(result.dropPercent).toBeNull();
    expect(result.confidence).toBe('MEDIUM');
  });

  it('prefers HISTORICAL_LOW over PERCENTAGE_BELOW_REFERENCE when both would apply', () => {
    // 50000 é o menor já visto E está > 10% abaixo da média (80000) — HISTORICAL_LOW vence.
    const result = classifyDeal({
      currentAmount: brl(50_000),
      lowestEverAmount: brl(50_000),
      averageAmount: brl(80_000),
      observationCount: 3,
    });
    expect(result.dealType).toBe('HISTORICAL_LOW');
  });

  it('classifies PERCENTAGE_BELOW_REFERENCE when current is below lowest-ever but far below average', () => {
    const result = classifyDeal({
      currentAmount: brl(60_000),
      lowestEverAmount: brl(50_000),
      averageAmount: brl(80_000),
      observationCount: 25,
    });
    expect(result.dealType).toBe('PERCENTAGE_BELOW_REFERENCE');
    expect(result.referenceAmount).toEqual(brl(80_000));
    expect(result.dropPercent).toBeCloseTo(25, 5);
    expect(result.confidence).toBe('HIGH');
  });

  it('returns null when the drop is below MIN_PERCENTAGE_BELOW_REFERENCE', () => {
    // 5% de queda, abaixo do limiar de 10%.
    const result = classifyDeal({
      currentAmount: brl(76_000),
      lowestEverAmount: brl(70_000),
      averageAmount: brl(80_000),
      observationCount: 10,
    });
    expect(result.dealType).toBeNull();
  });

  it('classifies exactly at the MIN_PERCENTAGE_BELOW_REFERENCE boundary', () => {
    const average = 100_000;
    const current = average * (1 - MIN_PERCENTAGE_BELOW_REFERENCE / 100);
    const result = classifyDeal({
      currentAmount: brl(current),
      lowestEverAmount: brl(current - 1),
      averageAmount: brl(average),
      observationCount: 10,
    });
    expect(result.dealType).toBe('PERCENTAGE_BELOW_REFERENCE');
  });

  it('returns null when current price is above both lowest-ever and the reference threshold', () => {
    const result = classifyDeal({
      currentAmount: brl(90_000),
      lowestEverAmount: brl(50_000),
      averageAmount: brl(80_000),
      observationCount: 10,
    });
    expect(result.dealType).toBeNull();
    expect(result.referenceAmount).toBeNull();
  });

  it.each([
    [4, 'LOW'],
    [5, 'MEDIUM'],
    [19, 'MEDIUM'],
    [20, 'HIGH'],
  ] as const)('classifies confidence for observationCount=%d as %s', (count, confidence) => {
    const result = classifyDeal({
      currentAmount: brl(90_000),
      lowestEverAmount: brl(50_000),
      averageAmount: brl(80_000),
      observationCount: count,
    });
    expect(result.confidence).toBe(confidence);
  });
});
