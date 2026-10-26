import type { CalendarDayInput } from './price-calendar';

/**
 * SPEC-045 — onde um preço se situa entre os preços observados no mês da
 * busca (o calendário da SPEC-031). Mesmo princípio da regra de alerta
 * (SPEC-039): comparar com a mediana do que o sistema observou, nunca com
 * "o mercado". Dinheiro em inteiro na menor unidade (CLAUDE.md §8.1).
 */

/** Menos dias que isso e o sistema não opina (igual ao mínimo das promoções, SPEC-032). */
export const MIN_CONTEXT_POINTS = 8;

/** Diferença de até 5% da mediana conta como "em linha". */
const NEAR_BPS = 500;

export interface PriceContext {
  kind: 'below' | 'near' | 'above';
  /** Diferença para a mediana, em % inteiro (0 quando "em linha"). */
  percent: number;
  medianMinor: number;
  /** Quantos dias do mês entraram na mediana. */
  sampleSize: number;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

export function describePriceContext(
  amountMinor: number,
  days: readonly CalendarDayInput[],
): PriceContext | null {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return null;
  }
  const prices = days.map((day) => day.amountMinor).filter((value) => value > 0);
  if (prices.length < MIN_CONTEXT_POINTS) {
    return null;
  }
  const median = medianOf(prices);
  if (median <= 0) {
    return null;
  }
  const diffBps = Math.round(((amountMinor - median) * 10_000) / median);
  if (Math.abs(diffBps) <= NEAR_BPS) {
    return { kind: 'near', percent: 0, medianMinor: median, sampleSize: prices.length };
  }
  return {
    kind: diffBps < 0 ? 'below' : 'above',
    percent: Math.round(Math.abs(diffBps) / 100),
    medianMinor: median,
    sampleSize: prices.length,
  };
}
