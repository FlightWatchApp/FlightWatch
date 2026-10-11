import { describe, expect, it } from 'vitest';
import {
  type PriceChart,
  buildPriceChart,
  monthsLabel,
  nearestPointIndex,
  priceChartSummary,
} from './price-chart';

function must(chart: PriceChart | null): PriceChart {
  if (!chart) throw new Error('gráfico esperado');
  return chart;
}

const BOX = { width: 280, height: 150, padding: 10 };

const days = [
  { date: '2026-11-17', amountMinor: 256800 },
  { date: '2026-11-05', amountMinor: 186300 },
  { date: '2026-11-10', amountMinor: 230000 },
  { date: '2026-11-25', amountMinor: 300000 },
];

describe('buildPriceChart (cartão da página inicial)', () => {
  it('ordena por data e espalha os pontos pela largura, do primeiro ao último dia', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: null,
      referenceAmountMinor: null,
    });

    expect(chart?.points.map((point) => point.date)).toEqual([
      '2026-11-05',
      '2026-11-10',
      '2026-11-17',
      '2026-11-25',
    ]);
    expect(chart?.points[0]?.x).toBe(10);
    expect(chart?.points[3]?.x).toBe(270);
    // 5 → 10 de novembro: 5 de 20 dias da largura útil (260).
    expect(chart?.points[1]?.x).toBe(75);
  });

  it('preço mais alto fica em cima e o mais baixo embaixo', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: null,
      referenceAmountMinor: null,
    });
    const cheapest = chart?.points.find((point) => point.amountMinor === 186300);
    const priciest = chart?.points.find((point) => point.amountMinor === 300000);

    expect(priciest?.y).toBe(10);
    expect(cheapest?.y).toBe(140);
  });

  it('marca a data da promoção e põe a linha de referência dentro da escala', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: { date: '2026-11-05', amountMinor: 186300 },
      referenceAmountMinor: 270000,
    });

    expect(chart?.highlighted?.date).toBe('2026-11-05');
    expect(chart?.points.filter((point) => point.highlighted)).toHaveLength(1);
    expect(chart?.referenceY).toBeGreaterThan(10);
    expect(chart?.referenceY).toBeLessThan(140);
  });

  it('referência fora da faixa dos preços amplia a escala em vez de sair do gráfico', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: null,
      referenceAmountMinor: 400000,
    });

    expect(chart?.referenceY).toBe(10);
    expect(chart?.points.every((point) => point.y >= 10 && point.y <= 140)).toBe(true);
  });

  it('data da promoção que o calendário não tem entra no gráfico com o preço da promoção', () => {
    const chart = must(
      buildPriceChart(days, {
        ...BOX,
        highlight: { date: '2026-11-20', amountMinor: 150000 },
        referenceAmountMinor: null,
      }),
    );

    expect(chart.points).toHaveLength(5);
    expect(chart.highlighted).toMatchObject({ date: '2026-11-20', amountMinor: 150000 });
    // É o menor preço: fica embaixo.
    expect(chart.highlighted?.y).toBe(140);
  });

  it('com preço diferente na mesma data, vale o preço da promoção (o que o cartão anuncia)', () => {
    const chart = must(
      buildPriceChart(days, {
        ...BOX,
        highlight: { date: '2026-11-17', amountMinor: 200000 },
        referenceAmountMinor: null,
      }),
    );

    expect(chart.points).toHaveLength(4);
    expect(chart.highlighted?.amountMinor).toBe(200000);
  });

  it('todos os preços iguais ficam numa linha no meio, sem dividir por zero', () => {
    const flat = [
      { date: '2026-11-01', amountMinor: 100000 },
      { date: '2026-11-02', amountMinor: 100000 },
    ];
    const chart = buildPriceChart(flat, {
      ...BOX,
      highlight: null,
      referenceAmountMinor: null,
    });

    expect(chart?.points.map((point) => point.y)).toEqual([75, 75]);
  });

  it('menos de dois preços não desenha gráfico', () => {
    expect(
      buildPriceChart(days.slice(0, 1), {
        ...BOX,
        highlight: null,
        referenceAmountMinor: null,
      }),
    ).toBeNull();
    expect(buildPriceChart([], { ...BOX, highlight: null, referenceAmountMinor: null })).toBeNull();
  });

  it('caminho da linha começa no primeiro ponto e a área fecha na base', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: null,
      referenceAmountMinor: null,
    });

    expect(chart?.linePath.startsWith('M10 ')).toBe(true);
    expect(chart?.areaPath.endsWith('L270 150 L10 150 Z')).toBe(true);
  });
});

describe('nearestPointIndex', () => {
  it('acha o ponto mais próximo na horizontal', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: null,
      referenceAmountMinor: null,
    });
    expect(nearestPointIndex(must(chart).points, 0)).toBe(0);
    expect(nearestPointIndex(must(chart).points, 80)).toBe(1);
    expect(nearestPointIndex(must(chart).points, 999)).toBe(3);
  });
});

describe('priceChartSummary (leitor de tela)', () => {
  it('resume a faixa de preços e a data da promoção', () => {
    const chart = buildPriceChart(days, {
      ...BOX,
      highlight: { date: '2026-11-05', amountMinor: 186300 },
      referenceAmountMinor: 270000,
    });

    const summary = priceChartSummary(must(chart), 'BRL');

    expect(summary).toContain('4 datas');
    expect(summary).toContain('R$ 1.863,00 em 05/11');
    expect(summary).toContain('R$ 3.000,00 em 25/11');
    expect(summary).toContain('mediana das datas próximas: R$ 2.700,00');
  });
});

describe('monthsLabel', () => {
  it('um mês pelo nome; vários como intervalo, em ordem', () => {
    expect(monthsLabel(['2026-11'])).toBe('novembro');
    expect(monthsLabel(['2026-12', '2026-10', '2026-11'])).toBe('outubro a dezembro');
    expect(monthsLabel([])).toBe('');
  });
});
