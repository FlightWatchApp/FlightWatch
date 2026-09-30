import { type Money, assertSameCurrency, isLessThanOrEqual } from '../money/money.js';

export class InvalidReferenceAmountError extends Error {
  constructor() {
    super('reference amount must be greater than zero');
    this.name = 'InvalidReferenceAmountError';
  }
}

export class InvalidPercentageThresholdError extends Error {
  constructor(percent: number) {
    super(`configured percentage must be within (0, 100], received: ${percent}`);
    this.name = 'InvalidPercentageThresholdError';
  }
}

export interface TargetPriceRuleResult {
  triggered: boolean;
}

/** trigger = current_amount <= target_amount (DOMAIN.md §5 / SPEC-005 §4). */
export function evaluateTargetPriceRule(params: {
  currentAmount: Money;
  targetAmount: Money;
}): TargetPriceRuleResult {
  return { triggered: isLessThanOrEqual(params.currentAmount, params.targetAmount) };
}

export interface AbsoluteDropRuleResult {
  triggered: boolean;
  dropAmountMinor: number;
}

/** drop = reference - current; trigger = drop >= configured_amount. */
export function evaluateAbsoluteDropRule(params: {
  currentAmount: Money;
  referenceAmount: Money;
  configuredDropAmount: Money;
}): AbsoluteDropRuleResult {
  assertSameCurrency(params.currentAmount, params.referenceAmount);
  assertSameCurrency(params.currentAmount, params.configuredDropAmount);
  const dropAmountMinor = params.referenceAmount.amountMinor - params.currentAmount.amountMinor;
  return {
    triggered: dropAmountMinor >= params.configuredDropAmount.amountMinor,
    dropAmountMinor,
  };
}

export interface PercentageDropRuleResult {
  triggered: boolean;
  dropPercent: number;
}

// Suporta até 2 casas decimais no limiar configurado (ex.: 12.5%).
const PERCENT_PRECISION = 100;

/**
 * drop_percent = ((reference - current) / reference) * 100; trigger = drop_percent >= configured_percent.
 * A decisão de trigger usa comparação inteira por multiplicação cruzada (reference > 0 garante que a
 * multiplicação preserva a desigualdade), para nunca depender de arredondamento de ponto flutuante.
 */
export function evaluatePercentageDropRule(params: {
  currentAmount: Money;
  referenceAmount: Money;
  configuredPercent: number;
}): PercentageDropRuleResult {
  assertSameCurrency(params.currentAmount, params.referenceAmount);
  if (params.referenceAmount.amountMinor <= 0) {
    throw new InvalidReferenceAmountError();
  }
  if (params.configuredPercent <= 0 || params.configuredPercent > 100) {
    throw new InvalidPercentageThresholdError(params.configuredPercent);
  }

  const reference = params.referenceAmount.amountMinor;
  const current = params.currentAmount.amountMinor;
  const dropAmountMinor = reference - current;
  const scaledConfiguredPercent = Math.round(params.configuredPercent * PERCENT_PRECISION);

  const triggered =
    dropAmountMinor * 100 * PERCENT_PRECISION >= scaledConfiguredPercent * reference;

  return { triggered, dropPercent: (dropAmountMinor / reference) * 100 };
}

export interface NewObservedLowRuleResult {
  triggered: boolean;
}

/**
 * trigger = current_amount < minimum_valid_amount_since_watch_activation.
 * Sem observação de referência ainda, a regra relativa não dispara (SPEC-005 §11).
 */
export function evaluateNewObservedLowRule(params: {
  currentAmount: Money;
  minimumValidAmountSinceActivation: Money | null;
}): NewObservedLowRuleResult {
  if (params.minimumValidAmountSinceActivation === null) {
    return { triggered: false };
  }
  assertSameCurrency(params.currentAmount, params.minimumValidAmountSinceActivation);
  return {
    triggered:
      params.currentAmount.amountMinor < params.minimumValidAmountSinceActivation.amountMinor,
  };
}
