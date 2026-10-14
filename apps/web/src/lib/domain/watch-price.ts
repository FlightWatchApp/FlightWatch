import type { WatchLowPrice } from '@flight-watch/contracts';
import type { Money } from '@/lib/api/types';

/** Só apresentação (destaque de "menor preço já visto"); não decide alerta — isso é regra de AlertRule no backend. */
export function isAtLowestObservedPrice(watch: {
  currentPrice: Money | null;
  lowestPrice: Money | null;
}): boolean {
  if (!watch.currentPrice || !watch.lowestPrice) return false;
  return watch.currentPrice.amountMinor <= watch.lowestPrice.amountMinor;
}

/**
 * SPEC-039, só apresentação: o preço atual está no limite que a API calculou
 * para "bem abaixo do normal" (`lowPrice.thresholdAmountMinor`). Não decide
 * alerta — o alerta tem cooldown e "só cai mais" no backend.
 */
export function isBelowTypicalPrice(watch: {
  currentPrice: Money | null;
  lowPrice: WatchLowPrice | null;
}): boolean {
  const threshold = watch.lowPrice?.thresholdAmountMinor ?? null;
  if (!watch.currentPrice || threshold === null) return false;
  return watch.currentPrice.amountMinor <= threshold;
}

/**
 * Home logada: qual monitoramento mostrar em destaque. Preço bem abaixo do
 * normal vem primeiro, depois menor preço já visto, senão o primeiro ativo
 * com oferta — nunca inventa um "melhor" sem sinal real por trás.
 */
export function pickHighlightWatch<
  T extends {
    status: string;
    currentOffer: unknown;
    currentPrice: Money | null;
    lowPrice: WatchLowPrice | null;
    lowestPrice: Money | null;
  },
>(watches: T[]): T | null {
  const eligible = watches.filter((watch) => watch.status === 'ACTIVE' && watch.currentOffer);
  if (eligible.length === 0) return null;
  return (
    eligible.find((watch) => isBelowTypicalPrice(watch)) ??
    eligible.find((watch) => isAtLowestObservedPrice(watch)) ??
    eligible[0] ??
    null
  );
}
