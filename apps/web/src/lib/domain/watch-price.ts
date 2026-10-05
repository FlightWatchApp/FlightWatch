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
 * Só apresentação (destaque "Preço desejado atingido" no `WatchCard`, CP-09)
 * — não decide alerta nem repete a regra de domínio do `AlertRule` real
 * (que roda no backend e pode ter cooldown, referência diferente, etc.).
 */
export function isTargetReached(watch: {
  currentPrice: Money | null;
  targetAmountMinor: number | null;
}): boolean {
  if (!watch.currentPrice || watch.targetAmountMinor === null) return false;
  return watch.currentPrice.amountMinor <= watch.targetAmountMinor;
}

/**
 * Home logada: qual monitoramento mostrar em destaque. Preço desejado
 * atingido vem primeiro, depois menor preço já visto, senão o primeiro
 * ativo com oferta — nunca inventa um "melhor" sem sinal real por trás
 * (os dois únicos sinais que este domínio realmente tem).
 */
export function pickHighlightWatch<
  T extends {
    status: string;
    currentOffer: unknown;
    currentPrice: Money | null;
    targetAmountMinor: number | null;
    lowestPrice: Money | null;
  },
>(watches: T[]): T | null {
  const eligible = watches.filter((watch) => watch.status === 'ACTIVE' && watch.currentOffer);
  if (eligible.length === 0) return null;
  return (
    eligible.find((watch) => isTargetReached(watch)) ??
    eligible.find((watch) => isAtLowestObservedPrice(watch)) ??
    eligible[0] ??
    null
  );
}
