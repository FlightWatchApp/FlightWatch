import { describe, expect, it } from 'vitest';
import { isAtLowestObservedPrice, isTargetReached, pickHighlightWatch } from './watch-price';

describe('isTargetReached', () => {
  it('is true when the current price is at or below the desired price', () => {
    expect(
      isTargetReached({
        currentPrice: { amountMinor: 50000, currency: 'BRL' },
        targetAmountMinor: 50000,
      }),
    ).toBe(true);
    expect(
      isTargetReached({
        currentPrice: { amountMinor: 48000, currency: 'BRL' },
        targetAmountMinor: 50000,
      }),
    ).toBe(true);
  });

  it('is false when the current price is above the desired price', () => {
    expect(
      isTargetReached({
        currentPrice: { amountMinor: 51000, currency: 'BRL' },
        targetAmountMinor: 50000,
      }),
    ).toBe(false);
  });

  it('is false without a current price or without a desired price', () => {
    expect(isTargetReached({ currentPrice: null, targetAmountMinor: 50000 })).toBe(false);
    expect(
      isTargetReached({
        currentPrice: { amountMinor: 48000, currency: 'BRL' },
        targetAmountMinor: null,
      }),
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
    targetAmountMinor: number | null;
    lowestPrice: { amountMinor: number; currency: string } | null;
  }

  const watch = (overrides: Partial<TestWatch>): TestWatch => ({
    id: 'id',
    status: 'ACTIVE',
    currentOffer: { amountMinor: 1 },
    currentPrice: { amountMinor: 80000, currency: 'BRL' },
    targetAmountMinor: null,
    lowestPrice: null,
    ...overrides,
  });

  it('prefers a watch whose target price was reached', () => {
    const notReached = watch({ id: 'a', targetAmountMinor: 70000 });
    const reached = watch({ id: 'b', targetAmountMinor: 90000 });
    expect(pickHighlightWatch([notReached, reached])?.id).toBe('b');
  });

  it('falls back to a watch at its lowest observed price when no target is reached', () => {
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
