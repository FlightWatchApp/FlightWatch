import { createHash } from 'node:crypto';

export interface AlertEventDeduplicationKeyInput {
  watchId: string;
  alertRuleId: string;
  priceObservationId: string;
  ruleVersion: number;
}

// SPEC-005 §8: SHA-256(watch_id|rule_id|price_observation_id|rule_version).
// Redelivery do mesmo evento resolve pra mesma chave — no máximo um AlertEvent
// por avaliação lógica (constraint única no banco).
export function computeAlertEventDeduplicationKey(input: AlertEventDeduplicationKeyInput): string {
  const raw = `${input.watchId}|${input.alertRuleId}|${input.priceObservationId}|${input.ruleVersion}`;
  return createHash('sha256').update(raw).digest('hex');
}
