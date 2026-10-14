import { describe, expect, it } from 'vitest';
import { createMoney } from '../money/money.js';
import {
  LOW_PRICE_MIN_HISTORY_DAYS,
  evaluateLowPriceRule,
  lowPriceDropPercentIsValid,
  nearbyDatesBaseline,
  resolveTypicalPrice,
} from './low-price.js';

const brl = (amountMinor: number) => createMoney(amountMinor, 'BRL');
const days = (...amounts: number[]) =>
  amounts.map((amountMinor, index) => ({
    day: `2026-10-${String(index + 1).padStart(2, '0')}`,
    amountMinor,
  }));

describe('resolveTypicalPrice (SPEC-039)', () => {
  it('usa a mediana do menor preço de cada dia com 5 dias ou mais', () => {
    expect(
      resolveTypicalPrice({ dailyLows: days(500, 400, 450, 600, 420), baselineAmountMinor: 1 }),
    ).toEqual({ amountMinor: 450, source: 'HISTORY', historyDays: 5 });
  });

  it('com menos de 5 dias, usa a linha de base das datas próximas', () => {
    expect(LOW_PRICE_MIN_HISTORY_DAYS).toBe(5);
    expect(resolveTypicalPrice({ dailyLows: days(500, 400), baselineAmountMinor: 470 })).toEqual({
      amountMinor: 470,
      source: 'NEARBY_DATES',
      historyDays: 2,
    });
  });

  it('sem histórico suficiente nem linha de base, não há preço normal', () => {
    expect(resolveTypicalPrice({ dailyLows: days(500), baselineAmountMinor: null })).toBeNull();
  });

  it('linha de base inválida (zero ou negativa) é ignorada', () => {
    expect(resolveTypicalPrice({ dailyLows: [], baselineAmountMinor: 0 })).toBeNull();
  });
});

describe('evaluateLowPriceRule (SPEC-039)', () => {
  const base = { dropPercent: 15, lowestAmount: null, lastAlertAmount: null };

  it('15% abaixo do normal dispara; 14,99% não (borda em centavos)', () => {
    // 85% de 100000 = 85000.
    expect(
      evaluateLowPriceRule({ ...base, currentAmount: brl(85_000), typicalAmount: brl(100_000) }),
    ).toMatchObject({ triggered: true, reasons: ['BELOW_TYPICAL'], thresholdAmountMinor: 85_000 });
    expect(
      evaluateLowPriceRule({ ...base, currentAmount: brl(85_001), typicalAmount: brl(100_000) }),
    ).toMatchObject({ triggered: false, reasons: [] });
  });

  it('abaixo do menor já observado dispara; igual não', () => {
    const typicalAmount = null;
    expect(
      evaluateLowPriceRule({
        ...base,
        typicalAmount,
        currentAmount: brl(39_999),
        lowestAmount: brl(40_000),
      }),
    ).toMatchObject({ triggered: true, reasons: ['LOWEST_OBSERVED'] });
    expect(
      evaluateLowPriceRule({
        ...base,
        typicalAmount,
        currentAmount: brl(40_000),
        lowestAmount: brl(40_000),
      }),
    ).toMatchObject({ triggered: false, reasons: [] });
  });

  it('os dois motivos juntos viram um disparo só', () => {
    expect(
      evaluateLowPriceRule({
        ...base,
        currentAmount: brl(30_000),
        typicalAmount: brl(45_000),
        lowestAmount: brl(38_000),
      }),
    ).toMatchObject({ triggered: true, reasons: ['BELOW_TYPICAL', 'LOWEST_OBSERVED'] });
  });

  it('depois de um alerta, só dispara se cair abaixo do preço do último alerta', () => {
    const input = {
      ...base,
      typicalAmount: brl(45_000),
      lowestAmount: null,
    };
    expect(
      evaluateLowPriceRule({ ...input, currentAmount: brl(36_000), lastAlertAmount: brl(36_000) }),
    ).toMatchObject({
      triggered: false,
      reasons: ['BELOW_TYPICAL'],
      blockedBy: 'NOT_BELOW_LAST_ALERT',
    });
    expect(
      evaluateLowPriceRule({ ...input, currentAmount: brl(35_999), lastAlertAmount: brl(36_000) }),
    ).toMatchObject({ triggered: true, reasons: ['BELOW_TYPICAL'] });
  });

  it('sem nenhuma referência, não dispara e avisa que faltou referência', () => {
    expect(evaluateLowPriceRule({ ...base, currentAmount: brl(1), typicalAmount: null })).toEqual({
      triggered: false,
      reasons: [],
      noReference: true,
      thresholdAmountMinor: null,
    });
  });

  it('moedas diferentes não são comparadas', () => {
    expect(() =>
      evaluateLowPriceRule({
        ...base,
        currentAmount: brl(100),
        typicalAmount: createMoney(200, 'USD'),
      }),
    ).toThrow();
  });

  it('porcentagem válida é inteira de 5 a 50', () => {
    expect(lowPriceDropPercentIsValid(15)).toBe(true);
    expect(lowPriceDropPercentIsValid(4)).toBe(false);
    expect(lowPriceDropPercentIsValid(51)).toBe(false);
    expect(lowPriceDropPercentIsValid(12.5)).toBe(false);
  });
});

describe('nearbyDatesBaseline (SPEC-039)', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const price = (
    departureDate: string,
    amountMinor: number,
    observedAt = '2026-10-14T06:00:00Z',
  ) => ({
    departureDate,
    amountMinor,
    currency: 'BRL',
    observedAt,
  });

  it('mediana do menor preço por data, sem a própria data da viagem', () => {
    const prices = [
      price('2026-11-01', 400),
      price('2026-11-02', 500),
      price('2026-11-02', 450), // mesma data: fica o menor
      price('2026-11-03', 600),
      price('2026-11-04', 300),
      price('2026-11-05', 700),
      price('2026-11-10', 1), // a própria data: fora
    ];
    expect(
      nearbyDatesBaseline({ prices, departureDate: '2026-11-10', currency: 'BRL', now }),
    ).toEqual({ amountMinor: 450, points: 5 });
  });

  it('ignora preço velho, data passada e outra moeda; com menos de 5 datas, nada', () => {
    const prices = [
      price('2026-11-01', 400),
      price('2026-11-02', 500),
      price('2026-11-03', 600),
      price('2026-11-04', 300),
      price('2026-11-05', 700, '2026-10-01T00:00:00Z'), // mais de 72 h
      price('2026-10-01', 100), // data passada
      { ...price('2026-11-06', 100), currency: 'USD' },
    ];
    expect(
      nearbyDatesBaseline({ prices, departureDate: '2026-11-10', currency: 'BRL', now }),
    ).toBeNull();
  });
});
