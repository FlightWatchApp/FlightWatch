import { alertRuleInputSchema } from '@flight-watch/contracts';
import { describe, expect, it } from 'vitest';
import { buildLaunchAlertRules } from './alert-rules';

describe('buildLaunchAlertRules', () => {
  it('cobre preço desejado e novo menor preço observado (escopo D1 do MVP)', () => {
    const rules = buildLaunchAlertRules(80_000);

    expect(rules.map((rule) => rule.type)).toEqual(['TARGET_PRICE', 'NEW_OBSERVED_LOW']);
    expect(rules[0]).toMatchObject({ type: 'TARGET_PRICE', amountMinor: 80_000 });
  });

  it('gera regras aceitas pelo contrato da API, com cooldown de 12 h', () => {
    for (const rule of buildLaunchAlertRules(80_000)) {
      expect(alertRuleInputSchema.parse(rule).cooldownSeconds).toBe(43_200);
    }
  });
});
