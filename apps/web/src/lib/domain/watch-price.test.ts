import { describe, expect, it } from 'vitest';
import { isAtLowestObservedPrice } from './watch-price';

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
