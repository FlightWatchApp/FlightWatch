import { describe, expect, it } from 'vitest';
import { isAtLowestObservedPrice, isBelowTypicalPrice, pickHighlightWatch } from './watch-price';

describe('isBelowTypicalPrice (SPEC-039)', () => {
  const lowPrice = {
    dropPercent: 15,
    typicalAmountMinor: 100_000,
    typicalSource: 'HISTORY' as const,
    thresholdAmountMinor: 85_000,
    lowestAmountMinor: 80_000,
  };

  it('is true at or below the threshold the API computed', () => {
    expect(
      isBelowTypicalPrice({ currentPrice: { amountMinor: 85_000, currency: 'BRL' }, lowPrice }),
    ).toBe(true);
  });

  it('is false above the threshold, without a price, or without a typical price', () => {
    expect(
      isBelowTypicalPrice({ currentPrice: { amountMinor: 85_001, currency: 'BRL' }, lowPrice }),
    ).toBe(false);
    expect(isBelowTypicalPrice({ currentPrice: null, lowPrice })).toBe(false);
    expect(
      isBelowTypicalPrice({
        currentPrice: { amountMinor: 1, currency: 'BRL' },
        lowPrice: { ...lowPrice, typicalAmountMinor: null, thresholdAmountMinor: null },
      }),
    ).toBe(false);
    expect(
      isBelowTypicalPrice({ currentPrice: { amountMinor: 1, currency: 'BRL' }, lowPrice: null }),
    ).toBe(false);
  });
});

describe('isAtLowestObservedPrice', () => {
  it('is true when the current price equals the lowest ever observed', () => {
    expect(
      isAtLowestObservedPrice({
        currentPrice: { amountMinor: 79000, currency: 'BRL' },
        lowestPrice: { amountMinor: 79000, currency: 'BRL' },
      }),
    ).toBe(true);
  });

  it('is false when the current price is above the lowest observed', () => {
    expect(
      isAtLowestObservedPrice({
        currentPrice: { amountMinor: 82000, currency: 'BRL' },
        lowestPrice: { amountMinor: 79000, currency: 'BRL' },
      }),
    ).toBe(false);
  });

  it('is false when there is no current price yet', () => {
    expect(
      isAtLowestObservedPrice({
        currentPrice: null,
        lowestPrice: { amountMinor: 79000, currency: 'BRL' },
      }),
    ).toBe(false);
  });

  it('is false when there is no observation history yet', () => {
    expect(
      isAtLowestObservedPrice({
        currentPrice: { amountMinor: 79000, currency: 'BRL' },
        lowestPrice: null,
      }),
    ).toBe(false);
  });
});

describe('pickHighlightWatch', () => {
  interface TestWatch {
    id: string;
    status: string;
    currentOffer: unknown;
    currentPrice: { amountMinor: number; currency: string } | null;
    lowPrice: {
      dropPercent: number;
      typicalAmountMinor: number | null;
      typicalSource: 'HISTORY' | 'NEARBY_DATES' | null;
      thresholdAmountMinor: number | null;
      lowestAmountMinor: number | null;
    } | null;
    lowestPrice: { amountMinor: number; currency: string } | null;
  }

  const watch = (overrides: Partial<TestWatch>): TestWatch => ({
    id: 'id',
    status: 'ACTIVE',
    currentOffer: { amountMinor: 1 },
    currentPrice: { amountMinor: 80000, currency: 'BRL' },
    lowPrice: null,
    lowestPrice: null,
    ...overrides,
  });

  const lowPrice = (thresholdAmountMinor: number) => ({
    dropPercent: 15,
    typicalAmountMinor: 100_000,
    typicalSource: 'HISTORY' as const,
    thresholdAmountMinor,
    lowestAmountMinor: null,
  });

  it('prefers a watch whose price is well below normal', () => {
    const normal = watch({ id: 'a', lowPrice: lowPrice(70000) });
    const low = watch({ id: 'b', lowPrice: lowPrice(85000) });
    expect(pickHighlightWatch([normal, low])?.id).toBe('b');
  });

  it('falls back to a watch at its lowest observed price when none is below normal', () => {
    const plain = watch({ id: 'a' });
    const lowest = watch({ id: 'b', lowestPrice: { amountMinor: 80000, currency: 'BRL' } });
    expect(pickHighlightWatch([plain, lowest])?.id).toBe('b');
  });

  it('falls back to the first eligible watch when no signal applies', () => {
    expect(pickHighlightWatch([watch({ id: 'a' }), watch({ id: 'b' })])?.id).toBe('a');
  });

  it('ignores watches that are not active or have no current offer', () => {
    const paused = watch({ id: 'a', status: 'PAUSED' });
    const noOffer = watch({ id: 'b', currentOffer: null });
    const eligible = watch({ id: 'c' });
    expect(pickHighlightWatch([paused, noOffer, eligible])?.id).toBe('c');
  });

  it('returns null when there is no eligible watch', () => {
    expect(pickHighlightWatch([watch({ id: 'a', status: 'PAUSED' })])).toBeNull();
  });
});
