import { describe, expect, it } from 'vitest';
import {
  cheapestDates,
  formatDistanceKm,
  formatEstimatedDuration,
  routeIndexable,
  routeMetaDescription,
  routePriceNotice,
  routeTitle,
} from './route-page';

describe('fatos da rota (SPEC-033 EVAL-ROUTE-001)', () => {
  it('distância em km com separador de milhar', () => {
    expect(formatDistanceKm(875)).toBe('875 km');
    expect(formatDistanceKm(7934)).toBe('7.934 km');
  });

  it('tempo sempre como estimativa', () => {
    expect(formatEstimatedDuration(95)).toBe('cerca de 1 h 35 (estimado)');
    expect(formatEstimatedDuration(60)).toBe('cerca de 1 h (estimado)');
    expect(formatEstimatedDuration(45)).toBe('cerca de 45 min (estimado)');
  });
});

describe('cheapestDates', () => {
  const days = [
    { date: '2026-11-10', amountMinor: 100_000, stops: 0, observedAt: '2026-10-08T10:00:00Z' },
    { date: '2026-11-12', amountMinor: 80_000, stops: 1, observedAt: '2026-10-08T10:00:00Z' },
    { date: '2026-11-05', amountMinor: 80_000, stops: 0, observedAt: '2026-10-08T10:00:00Z' },
    { date: '2026-11-20', amountMinor: 90_000, stops: 0, observedAt: '2026-10-08T10:00:00Z' },
  ];

  it('mais baratas primeiro; empate pela data mais cedo; limite', () => {
    expect(cheapestDates(days, 3).map((day) => day.date)).toEqual([
      '2026-11-05',
      '2026-11-12',
      '2026-11-20',
    ]);
  });
});

describe('título e descrição (SPEC-033 §SEO)', () => {
  it('título sem preço', () => {
    expect(routeTitle('São Paulo', 'Dourados')).toBe('Passagens de São Paulo para Dourados');
  });

  it('descrição com o menor preço, a data e quando foi visto', () => {
    expect(
      routeMetaDescription('São Paulo', 'Dourados', {
        amountMinor: 48_900,
        currency: 'BRL',
        date: '2026-11-12',
        observedAt: '2026-10-08T15:00:00Z',
      }),
    ).toBe(
      'Menor preço encontrado de São Paulo para Dourados: R$ 489,00 em 12/11, visto em 08/10. Compare as datas, veja no mapa e monitore.',
    );
  });

  it('sem preço, a descrição não inventa valor', () => {
    expect(routeMetaDescription('São Paulo', 'Dourados', null)).toBe(
      'Rota de São Paulo para Dourados no mapa, com distância e aeroportos. Monitore para saber quando aparecer preço.',
    );
  });

  it('só página com preço é indexável', () => {
    expect(routeIndexable(3)).toBe(true);
    expect(routeIndexable(0)).toBe(false);
  });
});

describe('routePriceNotice (estados distintos, H04)', () => {
  it('sem preço, atualizando e fonte fora têm textos diferentes', () => {
    const notices = (['NO_PRICES', 'UPDATING', 'UNAVAILABLE'] as const).map(routePriceNotice);
    expect(new Set(notices).size).toBe(3);
    expect(routePriceNotice('OK')).toBeNull();
    expect(routePriceNotice('NO_PRICES')).toContain('Ainda não encontramos preços');
  });
});
