import { describe, expect, it } from 'vitest';
import { computeAlertEventDeduplicationKey } from './deduplication-key.js';

describe('computeAlertEventDeduplicationKey', () => {
  const base = {
    watchId: 'watch-1',
    alertRuleId: 'rule-1',
    priceObservationId: 'obs-1',
    ruleVersion: 1,
  };

  // AC-007 (SPEC-005): o mesmo evento processado três vezes cria um AlertEvent só.
  it('is deterministic for the same inputs', () => {
    expect(computeAlertEventDeduplicationKey(base)).toBe(computeAlertEventDeduplicationKey(base));
  });

  it.each(['watchId', 'alertRuleId', 'priceObservationId'] as const)(
    'differs when %s changes',
    (field) => {
      const changed = { ...base, [field]: `${base[field]}-other` };
      expect(computeAlertEventDeduplicationKey(base)).not.toBe(
        computeAlertEventDeduplicationKey(changed),
      );
    },
  );

  it('differs when the rule version changes', () => {
    const a = computeAlertEventDeduplicationKey(base);
    const b = computeAlertEventDeduplicationKey({ ...base, ruleVersion: 2 });
    expect(a).not.toBe(b);
  });
});
