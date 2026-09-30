import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, createMoney } from '../money/money.js';
import {
  InvalidPercentageThresholdError,
  InvalidReferenceAmountError,
  evaluateAbsoluteDropRule,
  evaluateNewObservedLowRule,
  evaluatePercentageDropRule,
  evaluateTargetPriceRule,
} from './alert-rule.js';

const brl = (amount: number) => createMoney(amount, 'BRL');

describe('evaluateTargetPriceRule', () => {
  // EVAL-ALERT-003: preço-alvo é inclusivo.
  it('triggers when current equals target', () => {
    expect(
      evaluateTargetPriceRule({ currentAmount: brl(80000), targetAmount: brl(80000) }).triggered,
    ).toBe(true);
  });

  it('triggers when current is below target', () => {
    expect(
      evaluateTargetPriceRule({ currentAmount: brl(70000), targetAmount: brl(80000) }).triggered,
    ).toBe(true);
  });

  it('does not trigger when current is above target', () => {
    expect(
      evaluateTargetPriceRule({ currentAmount: brl(90000), targetAmount: brl(80000) }).triggered,
    ).toBe(false);
  });

  it('rejects comparing different currencies', () => {
    expect(() =>
      evaluateTargetPriceRule({
        currentAmount: brl(80000),
        targetAmount: createMoney(80000, 'USD'),
      }),
    ).toThrow(CurrencyMismatchError);
  });
});

describe('evaluateAbsoluteDropRule', () => {
  // EVAL-ALERT-004: referência 1200, atual 990, limiar 200 -> trigger, queda 210.
  it('triggers and reports the exact drop amount', () => {
    const result = evaluateAbsoluteDropRule({
      currentAmount: brl(99000),
      referenceAmount: brl(120000),
      configuredDropAmount: brl(20000),
    });
    expect(result).toEqual({ triggered: true, dropAmountMinor: 21000 });
  });

  it('does not trigger when the drop is below the configured amount', () => {
    const result = evaluateAbsoluteDropRule({
      currentAmount: brl(115000),
      referenceAmount: brl(120000),
      configuredDropAmount: brl(20000),
    });
    expect(result.triggered).toBe(false);
  });

  // DOMAIN.md §5: aumento de preço resulta em queda negativa e não aciona a regra.
  it('reports a negative drop and does not trigger when the price increased', () => {
    const result = evaluateAbsoluteDropRule({
      currentAmount: brl(90000),
      referenceAmount: brl(80000),
      configuredDropAmount: brl(1000),
    });
    expect(result).toEqual({ triggered: false, dropAmountMinor: -10000 });
  });
});

describe('evaluatePercentageDropRule', () => {
  // EVAL-ALERT-001: referência 1000, atual 800, limiar 15% -> trigger, queda calculada em 20%.
  it('triggers and reports the exact drop percentage', () => {
    const result = evaluatePercentageDropRule({
      currentAmount: brl(80000),
      referenceAmount: brl(100000),
      configuredPercent: 15,
    });
    expect(result.triggered).toBe(true);
    expect(result.dropPercent).toBeCloseTo(20, 10);
  });

  // EVAL-ALERT-002: referência 1000, atual 930, limiar 15% -> não dispara (queda de 7%).
  it('does not trigger when the drop is below the threshold', () => {
    const result = evaluatePercentageDropRule({
      currentAmount: brl(93000),
      referenceAmount: brl(100000),
      configuredPercent: 15,
    });
    expect(result.triggered).toBe(false);
    expect(result.dropPercent).toBeCloseTo(7, 10);
  });

  it('does not trigger when the price increased', () => {
    const result = evaluatePercentageDropRule({
      currentAmount: brl(110000),
      referenceAmount: brl(100000),
      configuredPercent: 5,
    });
    expect(result.triggered).toBe(false);
  });

  it('rejects a zero or negative reference amount', () => {
    expect(() =>
      evaluatePercentageDropRule({
        currentAmount: brl(0),
        referenceAmount: brl(0),
        configuredPercent: 15,
      }),
    ).toThrow(InvalidReferenceAmountError);
  });

  it.each([0, -1, 101])('rejects an out-of-range configured percent: %s', (configuredPercent) => {
    expect(() =>
      evaluatePercentageDropRule({
        currentAmount: brl(80000),
        referenceAmount: brl(100000),
        configuredPercent,
      }),
    ).toThrow(InvalidPercentageThresholdError);
  });
});

describe('evaluateNewObservedLowRule', () => {
  // EVAL-ALERT-007: histórico 100000, 95000, 98000 (mínimo = 95000); atual 94000 -> trigger.
  it('triggers when current is below the minimum observed so far', () => {
    expect(
      evaluateNewObservedLowRule({
        currentAmount: brl(94000),
        minimumValidAmountSinceActivation: brl(95000),
      }).triggered,
    ).toBe(true);
  });

  // Mesmo histórico; atual 96000 -> não dispara.
  it('does not trigger when current is not below the minimum observed', () => {
    expect(
      evaluateNewObservedLowRule({
        currentAmount: brl(96000),
        minimumValidAmountSinceActivation: brl(95000),
      }).triggered,
    ).toBe(false);
  });

  // SPEC-005 §11: sem referência ainda, a regra relativa não dispara.
  it('does not trigger when there is no prior observation to compare against', () => {
    expect(
      evaluateNewObservedLowRule({
        currentAmount: brl(94000),
        minimumValidAmountSinceActivation: null,
      }).triggered,
    ).toBe(false);
  });

  it('rejects comparing different currencies', () => {
    expect(() =>
      evaluateNewObservedLowRule({
        currentAmount: brl(94000),
        minimumValidAmountSinceActivation: createMoney(95000, 'USD'),
      }),
    ).toThrow(CurrencyMismatchError);
  });
});
