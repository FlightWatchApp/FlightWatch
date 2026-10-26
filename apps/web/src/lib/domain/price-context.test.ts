import { describe, expect, it } from 'vitest';
import { MIN_CONTEXT_POINTS, describePriceContext } from './price-context';

const day = (n: number, amountMinor: number) => ({
  date: `2026-11-${String(n).padStart(2, '0')}`,
  amountMinor,
  stops: 0,
  observedAt: '2026-10-20T00:00:00Z',
});

/** 10 dias entre R$ 300 e R$ 480; mediana R$ 390. */
const MONTH = [300, 320, 340, 360, 380, 400, 420, 440, 460, 480].map((v, i) => day(i + 1, v * 100));

describe('describePriceContext (SPEC-045)', () => {
  it('abaixo da mediana: diz quanto, com mediana e quantidade de dias', () => {
    const context = describePriceContext(31_200, MONTH);
    expect(context).toEqual({ kind: 'below', percent: 20, medianMinor: 39_000, sampleSize: 10 });
  });

  it('acima da mediana', () => {
    expect(describePriceContext(46_800, MONTH)).toMatchObject({ kind: 'above', percent: 20 });
  });

  it('até 5% de diferença é "em linha"', () => {
    expect(describePriceContext(38_000, MONTH)).toMatchObject({ kind: 'near' });
    expect(describePriceContext(40_000, MONTH)).toMatchObject({ kind: 'near' });
  });

  it('poucos dias observados: não opina (null)', () => {
    expect(describePriceContext(31_200, MONTH.slice(0, MIN_CONTEXT_POINTS - 1))).toBeNull();
    expect(describePriceContext(31_200, [])).toBeNull();
  });

  it('preço inválido ou mediana zero: null', () => {
    expect(describePriceContext(0, MONTH)).toBeNull();
    expect(describePriceContext(-5, MONTH)).toBeNull();
    expect(
      describePriceContext(
        31_200,
        MONTH.map((d) => ({ ...d, amountMinor: 0 })),
      ),
    ).toBeNull();
  });

  it('mediana de quantidade par usa o meio (inteiro, sem float)', () => {
    const context = describePriceContext(
      30_000,
      [100, 200, 300, 400, 500, 600, 700, 800].map((v, i) => day(i + 1, v * 100)),
    );
    expect(context?.medianMinor).toBe(45_000);
    expect(Number.isInteger(context?.medianMinor)).toBe(true);
  });
});
