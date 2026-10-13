import { describe, expect, it } from 'vitest';
import { selectHighlights } from './highlights.js';

const NOW = new Date('2026-10-13T12:00:00Z');
const fresh = '2026-10-13T10:00:00Z';

function item(origin: string, destination: string, score: number, observedAt = fresh) {
  return { origin, destination, score, discountBps: score * 10, observedAt };
}

describe('selectHighlights (SPEC-034 AC-1)', () => {
  it('uma promoção por destino: fica a de maior score entre as origens', () => {
    const result = selectHighlights(
      [item('SAO', 'LIS', 60), item('RIO', 'LIS', 80), item('SAO', 'SSA', 70)],
      10,
      NOW,
    );
    expect(result.map((p) => `${p.origin}-${p.destination}`)).toEqual(['RIO-LIS', 'SAO-SSA']);
  });

  it('ordena por score, depois por desconto, e respeita o limite', () => {
    const result = selectHighlights(
      [item('SAO', 'A', 50), item('SAO', 'B', 90), item('SAO', 'C', 70)],
      2,
      NOW,
    );
    expect(result.map((p) => p.destination)).toEqual(['B', 'C']);
  });

  it('preço com mais de 72 h fica fora', () => {
    const result = selectHighlights(
      [item('SAO', 'LIS', 99, '2026-10-09T10:00:00Z'), item('RIO', 'LIS', 40)],
      10,
      NOW,
    );
    expect(result.map((p) => p.origin)).toEqual(['RIO']);
  });

  it('lista vazia continua vazia', () => {
    expect(selectHighlights([], 5, NOW)).toEqual([]);
  });
});
