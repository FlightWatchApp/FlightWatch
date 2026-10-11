import { formatMoney } from './money';

/**
 * Gráfico "preço por data" do cartão da página inicial: o menor preço
 * encontrado em cada data do mês (calendário da SPEC-031), com a data da
 * promoção marcada e a mediana de referência da SPEC-032 tracejada. Não é
 * histórico no tempo — cada ponto é uma data de viagem diferente.
 *
 * Datas são texto AAAA-MM-DD calculado em UTC (CLAUDE.md §8.2).
 */

export interface PriceChartDay {
  date: string;
  amountMinor: number;
}

export interface PriceChartPoint extends PriceChartDay {
  x: number;
  y: number;
  highlighted: boolean;
}

export interface PriceChart {
  points: PriceChartPoint[];
  linePath: string;
  areaPath: string;
  /** Linha da mediana de referência; null quando não há referência. */
  referenceY: number | null;
  referenceAmountMinor: number | null;
  /** Ponto da data da promoção, quando ela tem preço no calendário. */
  highlighted: PriceChartPoint | null;
}

export interface PriceChartOptions {
  width: number;
  height: number;
  padding: number;
  /**
   * Preço da promoção: vira o ponto destacado. Entra mesmo se o calendário
   * não tiver a data (as consultas da fonte são diferentes) e prevalece se
   * tiver outro preço nela — é o preço que o cartão anuncia.
   */
  highlight: PriceChartDay | null;
  referenceAmountMinor: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildPriceChart(
  days: readonly PriceChartDay[],
  options: PriceChartOptions,
): PriceChart | null {
  const { width, height, padding, highlight, referenceAmountMinor } = options;
  const merged = highlight
    ? [...days.filter((day) => day.date !== highlight.date), highlight]
    : [...days];
  const sorted = merged.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const firstEntry = sorted[0];
  const lastEntry = sorted[sorted.length - 1];
  if (sorted.length < 2 || !firstEntry || !lastEntry) return null;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const firstDay = dayNumber(firstEntry.date);
  const span = dayNumber(lastEntry.date) - firstDay;

  // A referência entra na escala para a linha tracejada nunca sair do gráfico.
  const amounts = sorted.map((day) => day.amountMinor);
  if (referenceAmountMinor !== null) amounts.push(referenceAmountMinor);
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);

  const yOf = (amountMinor: number): number =>
    max === min
      ? round(padding + innerHeight / 2)
      : round(padding + ((max - amountMinor) / (max - min)) * innerHeight);

  const points = sorted.map((day) => ({
    ...day,
    x: round(padding + (span === 0 ? 0 : ((dayNumber(day.date) - firstDay) / span) * innerWidth)),
    y: yOf(day.amountMinor),
    highlighted: day.date === highlight?.date,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');
  const firstX = points[0]?.x ?? padding;
  const lastX = points[points.length - 1]?.x ?? width - padding;

  return {
    points,
    linePath,
    areaPath: `${linePath} L${lastX} ${height} L${firstX} ${height} Z`,
    referenceY: referenceAmountMinor === null ? null : yOf(referenceAmountMinor),
    referenceAmountMinor,
    highlighted: points.find((point) => point.highlighted) ?? null,
  };
}

/** Índice do ponto mais próximo de `x` (passar o mouse ou tocar no gráfico). */
export function nearestPointIndex(points: readonly PriceChartPoint[], x: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** "05/11" — data de viagem sem passar por fuso. */
export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Valor com espaço comum (o Intl usa espaço não separável, ruim em rótulo de SVG). */
export function chartMoney(amountMinor: number, currency: string): string {
  return formatMoney({ amountMinor, currency }).replace(/\u00a0/g, ' ');
}

/** "05/11 · R$ 1.863,00" — rótulo de um ponto. */
export function pointLabel(point: PriceChartDay, currency: string): string {
  return `${shortDate(point.date)} · ${chartMoney(point.amountMinor, currency)}`;
}

/** Texto do gráfico para leitor de tela: o SVG em si é decorativo. */
export function priceChartSummary(chart: PriceChart, currency: string): string {
  const cheapest = chart.points.reduce((a, b) => (b.amountMinor < a.amountMinor ? b : a));
  const priciest = chart.points.reduce((a, b) => (b.amountMinor > a.amountMinor ? b : a));
  const parts = [
    `Menor preço encontrado em ${chart.points.length} datas`,
    `de ${chartMoney(cheapest.amountMinor, currency)} em ${shortDate(cheapest.date)}`,
    `a ${chartMoney(priciest.amountMinor, currency)} em ${shortDate(priciest.date)}`,
  ];
  if (chart.referenceAmountMinor !== null) {
    parts.push(`mediana das datas próximas: ${chartMoney(chart.referenceAmountMinor, currency)}`);
  }
  return `${parts.join(', ')}.`;
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "novembro" ou "outubro a dezembro" — a janela de meses da referência. */
export function monthsLabel(months: readonly string[]): string {
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return '';
  return first === last ? monthName(first) : `${monthName(first)} a ${monthName(last)}`;
}
