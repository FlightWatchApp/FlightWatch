import { describe, expect, it } from 'vitest';
import { explainPromotion, formatPromotionMoney } from './promotion-explanation.js';

const base = {
  amountMinor: 59_000,
  currency: 'BRL',
  discountBps: 3199,
  referencePointCount: 24,
  originName: 'Campo Grande',
  destinationName: 'Salvador',
};

describe('explainPromotion (SPEC-032 §Contrato)', () => {
  it('texto do exemplo da spec, com percentual arredondado para baixo', () => {
    expect(explainPromotion({ ...base, months: ['2026-10', '2026-11', '2026-12'] })).toBe(
      'R$ 590 está 31% abaixo da mediana de 24 preços encontrados para Campo Grande → Salvador entre outubro e dezembro de 2026.',
    );
  });

  it('um mês só e virada de ano', () => {
    expect(explainPromotion({ ...base, months: ['2026-11'] })).toContain('em novembro de 2026.');
    expect(explainPromotion({ ...base, months: ['2026-12', '2027-01'] })).toContain(
      'entre dezembro de 2026 e janeiro de 2027.',
    );
  });

  it('centavos aparecem só quando existem', () => {
    expect(formatPromotionMoney(59_000, 'BRL')).toBe('R$ 590');
    expect(formatPromotionMoney(59_050, 'BRL')).toBe('R$ 590,50');
    expect(formatPromotionMoney(123_456_700, 'BRL')).toBe('R$ 1.234.567');
  });
});
