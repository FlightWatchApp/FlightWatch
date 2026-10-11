import type { AlertRuleInput } from '@flight-watch/contracts';

// Mesmo cooldown que `createWatch`/`deriveWatch` já usavam: 12 h.
const COOLDOWN_SECONDS = 43_200;

/**
 * Escopo de alertas do lançamento (checklist pré-lançamento D1): preço desejado
 * e novo menor preço observado. Queda absoluta e percentual existem no domínio
 * e na API, mas a interface não as oferece — todo texto da UI sobre alertas
 * precisa prometer exatamente estas duas.
 */
export function buildLaunchAlertRules(targetAmountMinor: number): AlertRuleInput[] {
  return [
    { type: 'TARGET_PRICE', amountMinor: targetAmountMinor, cooldownSeconds: COOLDOWN_SECONDS },
    { type: 'NEW_OBSERVED_LOW', cooldownSeconds: COOLDOWN_SECONDS },
  ];
}
