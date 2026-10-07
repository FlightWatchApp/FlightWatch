import { describe, expect, it } from 'vitest';
import { fareSummaryHeadline, formatDuration, formatStops } from './flight-format';

describe('formatDuration', () => {
  it('formata horas e minutos', () => {
    expect(formatDuration(785)).toBe('13h05');
    expect(formatDuration(45)).toBe('0h45');
  });

  it('duração desconhecida (resumo de tarifa) devolve null', () => {
    expect(formatDuration(null)).toBeNull();
  });
});

describe('formatStops', () => {
  it('direto, uma e várias conexões', () => {
    expect(formatStops(0)).toBe('Direto');
    expect(formatStops(1)).toBe('1 conexão');
    expect(formatStops(2)).toBe('2 conexões');
  });
});

describe('fareSummaryHeadline (SPEC-030)', () => {
  it('só ida: dia e mês da data de viagem, sem deslocar fuso', () => {
    expect(fareSummaryHeadline({ departureDate: '2026-11-17', returnDate: null })).toBe(
      'Menor preço encontrado para 17/11',
    );
    // 1º de janeiro não pode virar 31/12 em fuso negativo.
    expect(fareSummaryHeadline({ departureDate: '2027-01-01', returnDate: null })).toBe(
      'Menor preço encontrado para 01/01',
    );
  });

  it('ida e volta mostra as duas datas', () => {
    expect(fareSummaryHeadline({ departureDate: '2026-11-10', returnDate: '2026-12-01' })).toBe(
      'Menor preço encontrado para 10/11, volta 01/12',
    );
  });
});
