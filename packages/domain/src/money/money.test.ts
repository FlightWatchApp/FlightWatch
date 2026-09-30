import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  InvalidCurrencyCodeError,
  InvalidMoneyAmountError,
  assertSameCurrency,
  createMoney,
  differenceMinor,
  isLessThan,
  isLessThanOrEqual,
} from './money.js';

describe('createMoney', () => {
  it('creates money from an integer minor amount and a valid currency', () => {
    const money = createMoney(97000, 'BRL');
    expect(money).toEqual({ amountMinor: 97000, currency: 'BRL' });
  });

  it('accepts zero as a valid amount', () => {
    expect(() => createMoney(0, 'BRL')).not.toThrow();
  });

  // EVAL-PRICE-002: dinheiro nunca é representado em ponto flutuante no domínio.
  it('rejects non-integer amounts', () => {
    expect(() => createMoney(970.1, 'BRL')).toThrow(InvalidMoneyAmountError);
  });

  it('rejects negative amounts', () => {
    expect(() => createMoney(-100, 'BRL')).toThrow(InvalidMoneyAmountError);
  });

  it.each(['brl', 'BR', 'BRLL', '', '123'])('rejects malformed currency code: %s', (currency) => {
    expect(() => createMoney(1000, currency)).toThrow(InvalidCurrencyCodeError);
  });
});

describe('comparisons', () => {
  it('assertSameCurrency throws for different currencies', () => {
    const brl = createMoney(1000, 'BRL');
    const usd = createMoney(1000, 'USD');
    expect(() => assertSameCurrency(brl, usd)).toThrow(CurrencyMismatchError);
  });

  it('isLessThanOrEqual is true when equal or lower', () => {
    expect(isLessThanOrEqual(createMoney(800, 'BRL'), createMoney(800, 'BRL'))).toBe(true);
    expect(isLessThanOrEqual(createMoney(700, 'BRL'), createMoney(800, 'BRL'))).toBe(true);
    expect(isLessThanOrEqual(createMoney(900, 'BRL'), createMoney(800, 'BRL'))).toBe(false);
  });

  it('isLessThan is strict', () => {
    expect(isLessThan(createMoney(800, 'BRL'), createMoney(800, 'BRL'))).toBe(false);
    expect(isLessThan(createMoney(700, 'BRL'), createMoney(800, 'BRL'))).toBe(true);
  });

  it('isLessThanOrEqual throws on currency mismatch instead of comparing silently', () => {
    expect(() => isLessThanOrEqual(createMoney(800, 'BRL'), createMoney(800, 'USD'))).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe('differenceMinor', () => {
  it('returns a positive value when price dropped', () => {
    expect(differenceMinor(createMoney(120000, 'BRL'), createMoney(99000, 'BRL'))).toBe(21000);
  });

  it('returns a negative value when price increased', () => {
    expect(differenceMinor(createMoney(80000, 'BRL'), createMoney(90000, 'BRL'))).toBe(-10000);
  });
});
