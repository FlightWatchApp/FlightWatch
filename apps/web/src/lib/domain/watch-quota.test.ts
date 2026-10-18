import { describe, expect, it } from 'vitest';
import { monthlyLimitMessage, quotaLabel } from './watch-quota';

describe('quotaLabel (SPEC-043)', () => {
  it('mostra "3 de 5 neste mês"', () => {
    expect(quotaLabel({ used: 3, limit: 5, resetsAt: '2026-11-01T04:00:00.000Z' })).toBe(
      '3 de 5 neste mês',
    );
  });

  it('sem limite (admin) não mostra nada', () => {
    expect(quotaLabel({ used: 9, limit: null, resetsAt: '2026-11-01T04:00:00.000Z' })).toBeNull();
  });
});

describe('monthlyLimitMessage (SPEC-043)', () => {
  it('diz o limite e o dia em que libera, no fuso de Campo Grande', () => {
    expect(monthlyLimitMessage({ limit: 5, resetsAt: '2026-11-01T04:00:00.000Z' })).toBe(
      'Você já criou os 5 monitoramentos deste mês. Novos ficam liberados em 1º de novembro.',
    );
  });

  it('1º de dezembro e singular', () => {
    expect(monthlyLimitMessage({ limit: 1, resetsAt: '2026-12-01T04:00:00.000Z' })).toBe(
      'Você já criou o 1 monitoramento deste mês. Novos ficam liberados em 1º de dezembro.',
    );
  });

  it('sem detalhes úteis cai numa mensagem genérica', () => {
    expect(monthlyLimitMessage(undefined)).toBe(
      'Você chegou ao limite de monitoramentos deste mês. Novos ficam liberados no mês que vem.',
    );
  });
});
