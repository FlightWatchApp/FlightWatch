import { describe, expect, it } from 'vitest';
import { buildCalendarGrid, shiftReturnDate } from './price-calendar';

const days = [
  { date: '2026-11-10', amountMinor: 42_000, stops: 1, observedAt: '2026-10-06T00:00:00Z' },
  { date: '2026-11-17', amountMinor: 256_800, stops: 0, observedAt: '2026-10-06T00:00:00Z' },
  { date: '2026-11-20', amountMinor: 42_000, stops: 0, observedAt: '2026-10-06T00:00:00Z' },
];

describe('buildCalendarGrid (SPEC-031 AC-4)', () => {
  const grid = buildCalendarGrid('2026-11', days, '2026-11-17', 'BRL');
  const cells = grid.weeks.flat();
  const cell = (date: string) => cells.find((c) => c?.date === date);

  it('novembro de 2026 começa num domingo e tem 30 dias em 5 semanas', () => {
    expect(grid.title).toBe('novembro de 2026');
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0]?.[0]?.date).toBe('2026-11-01');
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it('dia sem preço continua na grade, sem valor', () => {
    expect(cell('2026-11-01')?.amountMinor).toBeNull();
  });

  it('marca todos os dias com o menor preço e o dia escolhido', () => {
    expect(cell('2026-11-10')?.cheapest).toBe(true);
    expect(cell('2026-11-20')?.cheapest).toBe(true);
    expect(cell('2026-11-17')?.cheapest).toBe(false);
    expect(cell('2026-11-17')?.selected).toBe(true);
  });

  it('rótulo acessível diz data, preço e destaque', () => {
    expect(cell('2026-11-10')?.label).toBe('10 de novembro, R$ 420,00, menor preço do mês');
    expect(cell('2026-11-17')?.label).toBe('17 de novembro, R$ 2.568,00, data escolhida');
    expect(cell('2026-11-02')?.label).toBe('2 de novembro, sem preço encontrado');
  });

  it('mês que começa no meio da semana tem células vazias antes do dia 1', () => {
    const december = buildCalendarGrid('2026-12', [], null, 'BRL');
    // 1º/12/2026 é uma terça: domingo e segunda vazios.
    expect(december.weeks[0]?.slice(0, 3).map((c) => c?.date ?? null)).toEqual([
      null,
      null,
      '2026-12-01',
    ]);
  });
});

describe('shiftReturnDate', () => {
  it('mantém a duração da viagem ao trocar a data de ida', () => {
    expect(shiftReturnDate('2026-11-10', '2026-11-17', '2026-11-20')).toBe('2026-11-27');
    expect(shiftReturnDate('2026-11-28', '2026-12-05', '2026-11-30')).toBe('2026-12-07');
  });

  it('só ida continua sem volta', () => {
    expect(shiftReturnDate('2026-11-10', null, '2026-11-20')).toBeNull();
  });
});
