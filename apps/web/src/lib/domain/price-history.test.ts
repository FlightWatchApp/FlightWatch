import { describe, expect, it } from 'vitest';
import { indexOfLowest, sortChronologically } from './price-history.js';

const point = (id: string, observedAt: string, amountMinor: number) => ({
  id,
  observedAt,
  amountMinor,
  currency: 'BRL',
});

describe('sortChronologically', () => {
  // CP-10: a API devolve do mais novo para o mais antigo; o gráfico precisa
  // do sentido contrário.
  it('reorders newest-first input into oldest-to-newest', () => {
    const newestFirst = [
      point('3', '2026-09-03T00:00:00Z', 100),
      point('2', '2026-09-02T00:00:00Z', 110),
      point('1', '2026-09-01T00:00:00Z', 120),
    ];
    expect(sortChronologically(newestFirst).map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('does not mutate the input array', () => {
    const input = [point('1', '2026-09-01T00:00:00Z', 100)];
    const result = sortChronologically(input);
    expect(result).not.toBe(input);
  });
});

describe('indexOfLowest', () => {
  it('finds the index of the cheapest point', () => {
    const points = [
      point('1', '2026-09-01T00:00:00Z', 150),
      point('2', '2026-09-02T00:00:00Z', 90),
      point('3', '2026-09-03T00:00:00Z', 120),
    ];
    expect(indexOfLowest(points)).toBe(1);
  });

  it('returns -1 for an empty list', () => {
    expect(indexOfLowest([])).toBe(-1);
  });
});
