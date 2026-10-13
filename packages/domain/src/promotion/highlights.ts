import { promotionFreshness } from './promotion.js';

export interface HighlightCandidate {
  destination: string;
  score: number;
  discountBps: number;
  /** Quando a fonte viu o preço (SPEC-030). */
  observedAt: string;
}

/**
 * SPEC-034: a vitrine junta promoções de várias origens. Uma por destino (a
 * de maior score — sem "Lisboa, Lisboa, Lisboa"), preço com mais de 72 h
 * fora, ordem por score e, no empate, por desconto.
 */
export function selectHighlights<T extends HighlightCandidate>(
  items: readonly T[],
  limit: number,
  now: Date,
): T[] {
  const best = new Map<string, T>();
  for (const item of items) {
    if (promotionFreshness(item.observedAt, now) === 'EXPIRED') continue;
    const current = best.get(item.destination);
    if (!current || compare(item, current) < 0) best.set(item.destination, item);
  }
  return [...best.values()].sort(compare).slice(0, limit);
}

function compare(a: HighlightCandidate, b: HighlightCandidate): number {
  return b.score - a.score || b.discountBps - a.discountBps;
}
