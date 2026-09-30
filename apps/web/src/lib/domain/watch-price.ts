import type { Money } from '@/lib/api/types';

/** Só apresentação (destaque de "menor preço já visto"); não decide alerta — isso é regra de AlertRule no backend. */
export function isAtLowestObservedPrice(watch: {
  currentPrice: Money | null;
  lowestPrice: Money | null;
}): boolean {
  if (!watch.currentPrice || !watch.lowestPrice) return false;
  return watch.currentPrice.amountMinor <= watch.lowestPrice.amountMinor;
}
