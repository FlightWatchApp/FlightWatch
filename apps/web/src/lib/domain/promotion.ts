import type { PromotionFeedStatus } from '@flight-watch/contracts';
import { formatMoney } from './money';

const HOUR_MS = 60 * 60 * 1000;
/** SPEC-032 §Frescor: até 24 h normal; de 24 h a 72 h, "pode ter mudado". */
const RECENT_PRICE_HOURS = 24;

/** "↓ 31% abaixo das datas próximas" — a base da comparação, nunca "% OFF". */
export function promotionDiscountLabel(discountBps: number): string {
  return `↓ ${Math.floor(discountBps / 100)}% abaixo das datas próximas`;
}

export function promotionReferenceLabel(reference: {
  amountMinor: number;
  currency: string;
  pointCount: number;
}): string {
  const amount = formatMoney({ amountMinor: reference.amountMinor, currency: reference.currency });
  return `Mediana de ${reference.pointCount} preços: ${amount}`;
}

/** Idade pela hora em que a fonte viu o preço. */
export function promotionAgeLabel(
  observedAt: string,
  now: Date = new Date(),
): { text: string; aging: boolean } {
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(observedAt)) / HOUR_MS));
  const age = hours < 1 ? 'menos de 1 h' : `${hours} h`;
  const aging = hours >= RECENT_PRICE_HOURS;
  return {
    text: `Preço encontrado há ${age}${aging ? ' · pode ter mudado' : ''}`,
    aging,
  };
}

export type PromotionFeedState =
  'NO_ORIGIN' | 'UNAVAILABLE' | 'DISABLED' | 'BUDGET_EXHAUSTED' | 'EMPTY' | 'READY';

export type PromotionFeedResult =
  | { kind: 'no-origin' }
  | { kind: 'unavailable' }
  | { kind: 'feed'; status: PromotionFeedStatus; count: number };

/** SPEC-032 AC-9: carregando, sem origem, sem promoção, orçamento esgotado e fonte fora são distintos. */
export function promotionFeedState(result: PromotionFeedResult): PromotionFeedState {
  if (result.kind === 'no-origin') return 'NO_ORIGIN';
  if (result.kind === 'unavailable') return 'UNAVAILABLE';
  if (result.status === 'DISABLED') return 'DISABLED';
  if (result.status === 'BUDGET_EXHAUSTED') return 'BUDGET_EXHAUSTED';
  return result.count > 0 ? 'READY' : 'EMPTY';
}
