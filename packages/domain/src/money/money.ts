export class InvalidMoneyAmountError extends Error {
  constructor(amountMinor: number) {
    super(`Money amount must be a non-negative integer, received: ${amountMinor}`);
    this.name = 'InvalidMoneyAmountError';
  }
}

export class InvalidCurrencyCodeError extends Error {
  constructor(currency: string) {
    super(`Currency must be a 3-letter ISO 4217 code, received: "${currency}"`);
    this.name = 'InvalidCurrencyCodeError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot compare amounts in different currencies: ${a} vs ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

/**
 * Dinheiro em unidade monetária mínima inteira (ex.: centavos). Rejeita qualquer
 * valor não-inteiro para impedir que ponto flutuante entre no domínio (DOMAIN.md §3.6).
 */
export function createMoney(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new InvalidMoneyAmountError(amountMinor);
  }
  if (!CURRENCY_CODE_PATTERN.test(currency)) {
    throw new InvalidCurrencyCodeError(currency);
  }
  return { amountMinor, currency };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function isLessThanOrEqual(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.amountMinor <= b.amountMinor;
}

export function isLessThan(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.amountMinor < b.amountMinor;
}

/** a - b, em unidade mínima. Pode ser negativo (preço subiu); por isso não retorna Money. */
export function differenceMinor(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinor - b.amountMinor;
}
