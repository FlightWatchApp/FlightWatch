import type { Money } from '@/lib/api/types';

/**
 * Converte de unidade mínima (DOMAIN.md §3.6) para a representação exibível,
 * usando os dígitos fracionários corretos da própria moeda (2 para BRL/USD, mas
 * sem presumir isso para qualquer moeda futura).
 */
export function formatMoney(money: Money, locale = 'pt-BR'): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  });
  // Sempre definido para style: 'currency' pelo spec do Intl; o tipo só o marca opcional
  // por causa do modo de dígitos significativos, que não usamos aqui.
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = money.amountMinor / 10 ** digits;
  return formatter.format(amount);
}

export function formatPercent(percent: number, locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percent) + '%';
}

/** Diferença percentual entre duas quantias na mesma moeda, para exibição (não decide alerta). */
export function computeDisplayDropPercent(referenceMinor: number, currentMinor: number): number {
  if (referenceMinor <= 0) return 0;
  return ((referenceMinor - currentMinor) / referenceMinor) * 100;
}

/**
 * Inverso de `formatMoney`: string digitada pelo usuário (vírgula ou ponto)
 * -> unidade mínima inteira. `null` para entrada vazia/inválida/não-positiva
 * — usado tanto por `watches/new` quanto por `search/[id]` (SPEC-014) para
 * não divergir na regra de parsing do preço-alvo.
 */
export function parseAmountMinor(rawValue: string): number | null {
  const normalized = rawValue.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
}
