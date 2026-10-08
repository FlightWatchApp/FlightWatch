import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMOTION_POLICY,
  evaluatePromotion,
  medianMinor,
  promotionFreshness,
  promotionScope,
  promotionScore,
  referenceMonths,
  type PromotionInput,
  type PromotionPrice,
} from './promotion.js';

const NOW = new Date('2026-10-07T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

function price(departureDate: string, amountMinor: number, ageHours = 1): PromotionPrice {
  return { departureDate, amountMinor, currency: 'BRL', observedAt: hoursAgo(ageHours) };
}

/** `count` preços de referência no valor dado, em datas de novembro (sem 2026-11-20). */
function references(amountMinor: number, count: number): PromotionPrice[] {
  return Array.from({ length: count }, (_, index) =>
    price(`2026-11-${String(index + 1).padStart(2, '0')}`, amountMinor),
  );
}

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    candidate: price('2026-11-20', 59_000),
    currency: 'BRL',
    scope: 'DOMESTIC',
    referencePrices: references(100_000, 10),
    ...overrides,
  };
}

describe('medianMinor (SPEC-032 §Referência)', () => {
  it('quantidade ímpar: o do meio', () => {
    expect(medianMinor([300, 100, 200])).toBe(200);
  });

  it('quantidade par: média dos dois do meio, arredondada para baixo', () => {
    expect(medianMinor([100, 200, 301, 400])).toBe(250);
    expect(medianMinor([1, 2])).toBe(1);
  });

  it('lista vazia não tem mediana', () => {
    expect(() => medianMinor([])).toThrow();
  });
});

describe('referenceMonths (SPEC-032 §Referência)', () => {
  it('mês da data, anterior (se não for passado) e seguinte', () => {
    expect(referenceMonths('2026-12-10', NOW)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('mês anterior já passado fica de fora', () => {
    expect(referenceMonths('2026-10-20', NOW)).toEqual(['2026-10', '2026-11']);
  });

  it('virada de ano', () => {
    expect(referenceMonths('2027-01-05', NOW)).toEqual(['2026-12', '2027-01', '2027-02']);
  });
});

describe('promotionScope (SPEC-032 §Qualificação)', () => {
  it('mesmo país é nacional; países diferentes, internacional', () => {
    expect(promotionScope('BR', 'BR')).toBe('DOMESTIC');
    expect(promotionScope('BR', 'PT')).toBe('INTERNATIONAL');
  });
});

describe('promotionFreshness (SPEC-032 §Frescor)', () => {
  it('até 24 h é recente; até 72 h, pode ter mudado; depois, expirado', () => {
    expect(promotionFreshness(hoursAgo(0), NOW)).toBe('RECENT');
    expect(promotionFreshness(hoursAgo(24), NOW)).toBe('RECENT');
    expect(promotionFreshness(hoursAgo(25), NOW)).toBe('AGING');
    expect(promotionFreshness(hoursAgo(72), NOW)).toBe('AGING');
    expect(promotionFreshness(hoursAgo(73), NOW)).toBe('EXPIRED');
  });
});

describe('evaluatePromotion — referência (AC-2, EVAL-PROMO-003)', () => {
  it('a referência é a mediana sem a própria data', () => {
    const result = evaluatePromotion(
      input({
        // A própria data (59.000) não entra; senão a mediana cairia.
        referencePrices: [...references(100_000, 8), price('2026-11-20', 59_000)],
      }),
      DEFAULT_PROMOTION_POLICY,
      NOW,
    );
    expect(result.result).toBe('QUALIFIES');
    if (result.result !== 'QUALIFIES') return;
    expect(result.promotion.referenceAmountMinor).toBe(100_000);
    expect(result.promotion.referencePointCount).toBe(8);
    expect(result.promotion.referenceMonths).toEqual(['2026-11']);
  });

  it('abaixo do mínimo de pontos não afirma nada', () => {
    const result = evaluatePromotion(
      input({ referencePrices: references(100_000, 7) }),
      DEFAULT_PROMOTION_POLICY,
      NOW,
    );
    expect(result).toEqual({ result: 'INSUFFICIENT_DATA', referencePoints: 7 });
  });

  it('preços inválidos não contam como ponto de referência', () => {
    const result = evaluatePromotion(
      input({
        referencePrices: [
          ...references(100_000, 7),
          price('2026-11-25', 0),
          price('2026-11-26', 100_000, 73),
          { ...price('2026-11-27', 100_000), currency: 'USD' },
          price('2026-10-01', 100_000),
        ],
      }),
      DEFAULT_PROMOTION_POLICY,
      NOW,
    );
    expect(result).toEqual({ result: 'INSUFFICIENT_DATA', referencePoints: 7 });
  });

  it('meses da referência são os que contribuíram, em ordem', () => {
    const result = evaluatePromotion(
      input({
        referencePrices: [
          ...references(100_000, 6),
          price('2026-12-02', 100_000),
          price('2026-10-30', 100_000),
        ],
      }),
      DEFAULT_PROMOTION_POLICY,
      NOW,
    );
    expect(result.result === 'QUALIFIES' && result.promotion.referenceMonths).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });
});

describe('evaluatePromotion — preço do candidato (SPEC-032 §Qualificação)', () => {
  it.each([
    ['NON_POSITIVE', price('2026-11-20', 0)],
    ['CURRENCY', { ...price('2026-11-20', 59_000), currency: 'USD' }],
    ['PAST_DATE', price('2026-10-06', 59_000)],
    ['TOO_OLD', price('2026-11-20', 59_000, 73)],
  ] as const)('%s é inválido', (reason, candidate) => {
    expect(evaluatePromotion(input({ candidate }), DEFAULT_PROMOTION_POLICY, NOW)).toEqual({
      result: 'INVALID_PRICE',
      reason,
    });
  });

  it('viajar hoje não é data passada', () => {
    const result = evaluatePromotion(
      input({ candidate: price('2026-10-07', 59_000) }),
      DEFAULT_PROMOTION_POLICY,
      NOW,
    );
    expect(result.result).toBe('QUALIFIES');
  });
});

describe('evaluatePromotion — limiares em inteiros (AC-3, AC-4)', () => {
  it('nacional: 1499 bps não qualifica, 1500 qualifica', () => {
    // referência 100.000: 85.010 → 1499 bps; 85.000 → 1500 bps.
    expect(
      evaluatePromotion(
        input({ candidate: price('2026-11-20', 85_010) }),
        DEFAULT_PROMOTION_POLICY,
        NOW,
      ),
    ).toEqual({ result: 'NOT_PROMOTIONAL', discountBps: 1499 });
    const qualifies = evaluatePromotion(
      input({ candidate: price('2026-11-20', 85_000) }),
      DEFAULT_PROMOTION_POLICY,
      NOW,
    );
    expect(qualifies.result).toBe('QUALIFIES');
    if (qualifies.result !== 'QUALIFIES') return;
    expect(qualifies.promotion.discountBps).toBe(1500);
    expect(qualifies.promotion.absoluteSavingMinor).toBe(15_000);
  });

  it('internacional exige 2000 bps', () => {
    expect(
      evaluatePromotion(
        input({ scope: 'INTERNATIONAL', candidate: price('2026-11-20', 80_010) }),
        DEFAULT_PROMOTION_POLICY,
        NOW,
      ),
    ).toEqual({ result: 'NOT_PROMOTIONAL', discountBps: 1999 });
    expect(
      evaluatePromotion(
        input({ scope: 'INTERNATIONAL', candidate: price('2026-11-20', 80_000) }),
        DEFAULT_PROMOTION_POLICY,
        NOW,
      ).result,
    ).toBe('QUALIFIES');
  });

  it('desconto é arredondado para baixo, nunca para cima', () => {
    // referência 3, preço 2: 1/3 = 3333,33… bps.
    const result = evaluatePromotion(
      input({ candidate: price('2026-11-20', 2), referencePrices: references(3, 8) }),
      { ...DEFAULT_PROMOTION_POLICY, minDomesticDiscountBps: 1 },
      NOW,
    );
    expect(result.result === 'QUALIFIES' && result.promotion.discountBps).toBe(3333);
  });

  it('preço acima ou igual à referência não é promoção', () => {
    expect(
      evaluatePromotion(
        input({ candidate: price('2026-11-20', 120_000) }),
        DEFAULT_PROMOTION_POLICY,
        NOW,
      ),
    ).toEqual({ result: 'NOT_PROMOTIONAL', discountBps: -2000 });
  });

  it('a partir de 7000 bps é suspeito, nunca promoção (EVAL-PROMO-002)', () => {
    expect(
      evaluatePromotion(
        input({ candidate: price('2026-11-20', 30_000) }),
        DEFAULT_PROMOTION_POLICY,
        NOW,
      ),
    ).toEqual({ result: 'SUSPECT', discountBps: 7000 });
    expect(
      evaluatePromotion(
        input({ candidate: price('2026-11-20', 30_010) }),
        DEFAULT_PROMOTION_POLICY,
        NOW,
      ).result,
    ).toBe('QUALIFIES');
  });
});

describe('promotionScore (AC-5)', () => {
  const base = {
    discountBps: 1500,
    thresholdBps: 1500,
    absoluteSavingMinor: 0,
    savingScoreCapMinor: 100_000,
    observedAt: hoursAgo(72),
    now: NOW,
  };

  it('no limiar, sem economia e com 72 h: 0', () => {
    expect(promotionScore(base)).toBe(0);
  });

  it('tudo no máximo: 100', () => {
    expect(
      promotionScore({
        ...base,
        discountBps: 5000,
        absoluteSavingMinor: 100_000,
        observedAt: NOW.toISOString(),
      }),
    ).toBe(100);
  });

  it('cada componente satura no próprio teto', () => {
    expect(
      promotionScore({
        ...base,
        discountBps: 6900,
        absoluteSavingMinor: 500_000,
        observedAt: new Date(NOW.getTime() + HOUR).toISOString(),
      }),
    ).toBe(100);
  });

  it('pesos 50/20/30', () => {
    expect(promotionScore({ ...base, discountBps: 5000 })).toBe(50);
    expect(promotionScore({ ...base, absoluteSavingMinor: 100_000 })).toBe(20);
    expect(promotionScore({ ...base, observedAt: NOW.toISOString() })).toBe(30);
    // metade do caminho em cada um: 25 + 10 + 15.
    expect(
      promotionScore({
        ...base,
        discountBps: 3250,
        absoluteSavingMinor: 50_000,
        observedAt: hoursAgo(36),
      }),
    ).toBe(50);
  });

  it('a avaliação devolve score e versão', () => {
    const result = evaluatePromotion(input(), DEFAULT_PROMOTION_POLICY, NOW);
    expect(result.result).toBe('QUALIFIES');
    if (result.result !== 'QUALIFIES') return;
    expect(result.promotion.scoreVersion).toBe(1);
    expect(result.promotion.score).toBeGreaterThan(0);
    expect(result.promotion.score).toBeLessThanOrEqual(100);
  });
});
