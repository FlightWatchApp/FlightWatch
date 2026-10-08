import { describe, expect, it } from 'vitest';
import {
  promotionAgeLabel,
  promotionDiscountLabel,
  promotionFeedState,
  promotionReferenceLabel,
} from './promotion';

const NOW = new Date('2026-10-07T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();

describe('promotionDiscountLabel (SPEC-032 §Web)', () => {
  it('fala das datas próximas, nunca "% OFF", com percentual para baixo', () => {
    expect(promotionDiscountLabel(3199)).toBe('↓ 31% abaixo das datas próximas');
    expect(promotionDiscountLabel(3199)).not.toMatch(/OFF/i);
  });
});

describe('promotionReferenceLabel', () => {
  it('referência em reais e quantos preços', () => {
    // Intl separa "R$" do valor com espaço não separável.
    expect(
      promotionReferenceLabel({ amountMinor: 100_000, currency: 'BRL', pointCount: 24 }).replace(
        /\u00a0/g,
        ' ',
      ),
    ).toBe('Mediana de 24 preços: R$ 1.000,00');
  });
});

describe('promotionAgeLabel (SPEC-032 §Frescor)', () => {
  it('até 24 h: idade normal', () => {
    expect(promotionAgeLabel(ago(0.2), NOW)).toEqual({
      text: 'Preço encontrado há menos de 1 h',
      aging: false,
    });
    expect(promotionAgeLabel(ago(3), NOW)).toEqual({
      text: 'Preço encontrado há 3 h',
      aging: false,
    });
  });

  it('de 24 h a 72 h: avisa que pode ter mudado', () => {
    expect(promotionAgeLabel(ago(30), NOW)).toEqual({
      text: 'Preço encontrado há 30 h · pode ter mudado',
      aging: true,
    });
  });
});

describe('promotionFeedState (SPEC-032 AC-9: estados distintos)', () => {
  it('cada situação tem seu estado', () => {
    expect(promotionFeedState({ kind: 'no-origin' })).toBe('NO_ORIGIN');
    expect(promotionFeedState({ kind: 'unavailable' })).toBe('UNAVAILABLE');
    expect(promotionFeedState({ kind: 'feed', status: 'DISABLED', count: 0 })).toBe('DISABLED');
    expect(promotionFeedState({ kind: 'feed', status: 'BUDGET_EXHAUSTED', count: 0 })).toBe(
      'BUDGET_EXHAUSTED',
    );
    expect(promotionFeedState({ kind: 'feed', status: 'OK', count: 0 })).toBe('EMPTY');
    expect(promotionFeedState({ kind: 'feed', status: 'OK', count: 3 })).toBe('READY');
  });
});
