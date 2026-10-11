'use client';

import { type KeyboardEvent, type PointerEvent, useId, useMemo, useState } from 'react';
import {
  buildPriceChart,
  chartMoney,
  nearestPointIndex,
  pointLabel,
  priceChartSummary,
  type PriceChartDay,
} from '@/lib/domain/price-chart';
import styles from './price-by-date-chart.module.css';

const DEFAULT_SIZE = { width: 280, height: 150 };
const PADDING = 10;

export interface PriceByDateChartProps {
  days: readonly PriceChartDay[];
  /** Ponto destacado (promoção ou mais barato); entra mesmo se o calendário não tiver a data. */
  highlight: PriceChartDay | null;
  /** Rótulo do ponto destacado no tooltip e no leitor de tela, ex.: "promoção". */
  highlightLabel: string;
  referenceAmountMinor: number | null;
  currency: string;
  /** "novembro a janeiro". */
  periodLabel: string;
  /** Clicar ou Enter num ponto escolhe a data; sem isso, o gráfico só mostra. */
  onChoose?: (date: string) => void;
  /**
   * Proporção do desenho (unidades do SVG). O padrão serve ao cartão estreito;
   * em página larga, um formato largo e baixo evita um gráfico gigante.
   */
  size?: { width: number; height: number };
  /**
   * Altura fixa em CSS (ex.: "13rem"): o desenho estica na largura e as linhas
   * mantêm a espessura — para página larga, que vai do celular ao desktop.
   */
  height?: string;
}

/**
 * Preço por data (SPEC-031/032/033): cada ponto é uma data de viagem — não
 * é histórico no tempo. A mediana de referência fica tracejada. Mouse, toque
 * e setas mostram data e preço; o papel de slider anuncia o valor ao leitor
 * de tela, e o resumo em texto cobre o gráfico inteiro.
 */
export function PriceByDateChart({
  days,
  highlight,
  highlightLabel,
  referenceAmountMinor,
  currency,
  periodLabel,
  onChoose,
  size = DEFAULT_SIZE,
  height,
}: PriceByDateChartProps) {
  const CHART = { ...size, padding: PADDING };
  const gradientId = `fw-price-area-${useId().replace(/:/g, '')}`;
  const chart = useMemo(
    () =>
      buildPriceChart(days, {
        width: size.width,
        height: size.height,
        padding: PADDING,
        highlight,
        referenceAmountMinor,
      }),
    [days, highlight, referenceAmountMinor, size.width, size.height],
  );
  const [active, setActive] = useState<number | null>(null);
  if (!chart) return null;

  const activePoint = active !== null ? chart.points[active] : null;
  const shownPoint = activePoint ?? chart.highlighted ?? null;
  const shownIndex = shownPoint ? chart.points.indexOf(shownPoint) : 0;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CHART.width;
    setActive(nearestPointIndex(chart.points, x));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!chart) return;
    const current = active ?? Math.max(0, shownIndex);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive(Math.min(chart.points.length - 1, current + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive(Math.max(0, current - 1));
    } else if (event.key === 'Enter' && onChoose && shownPoint) {
      event.preventDefault();
      onChoose(shownPoint.date);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  }

  const valueText = shownPoint
    ? `${pointLabel(shownPoint, currency)}${shownPoint.highlighted ? `, ${highlightLabel}` : ''}`
    : undefined;

  return (
    // Setas escolhem a data: papel de slider, com a data e o preço no valor.
    <div
      className={`${styles.wrap} ${onChoose ? styles.choosable : ''}`.trim()}
      tabIndex={0}
      role="slider"
      aria-label={`Preço por data, ${periodLabel}${onChoose ? '. Enter busca a data escolhida' : ''}`}
      aria-valuemin={1}
      aria-valuemax={chart.points.length}
      aria-valuenow={shownIndex + 1}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
    >
      {/* Pontos e rótulo em HTML, posicionados em %: ficam redondos e do mesmo
          tamanho mesmo quando o desenho estica (altura fixa). */}
      <div className={styles.plot}>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          preserveAspectRatio={height ? 'none' : undefined}
          className={styles.chart}
          style={height ? { height } : undefined}
          aria-hidden="true"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onClick={() => {
            if (onChoose && activePoint) onChoose(activePoint.date);
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.14" />
              <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={chart.areaPath} fill={`url(#${gradientId})`} className={styles.area} />
          {chart.referenceY !== null && (
            <line
              x1={CHART.padding}
              x2={CHART.width - CHART.padding}
              y1={chart.referenceY}
              y2={chart.referenceY}
              className={styles.referenceLine}
            />
          )}
          <path d={chart.linePath} pathLength={1} className={styles.line} />
          {activePoint && (
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={CHART.padding}
              y2={CHART.height - CHART.padding}
              className={styles.cursor}
            />
          )}
        </svg>
        {chart.highlighted && (
          <span
            className={styles.highlightPoint}
            style={position(chart.highlighted, CHART)}
            aria-hidden="true"
          />
        )}
        {activePoint && !activePoint.highlighted && (
          <span
            className={styles.activePoint}
            style={position(activePoint, CHART)}
            aria-hidden="true"
          />
        )}
        {shownPoint && (
          <span
            className={styles.tooltip}
            // Deslocamento proporcional à posição: no começo o rótulo sai para a direita do
            // ponto, no fim para a esquerda — nunca passa da borda do gráfico.
            style={{
              left: `${(shownPoint.x / CHART.width) * 100}%`,
              transform: `translateX(-${(shownPoint.x / CHART.width) * 100}%)`,
            }}
            aria-hidden="true"
          >
            {pointLabel(shownPoint, currency)}
            {shownPoint.highlighted ? ` · ${highlightLabel}` : ''}
          </span>
        )}
      </div>
      <p className={styles.caption}>
        Preço por data, {periodLabel}
        {chart.referenceAmountMinor !== null &&
          ` · tracejado: mediana das datas (${chartMoney(chart.referenceAmountMinor, currency)})`}
        {onChoose ? ' · clique numa data para buscar' : ''}
      </p>
      <p className="visually-hidden">{priceChartSummary(chart, currency)}</p>
    </div>
  );
}

/** Posição do ponto em % da área desenhada. */
function position(
  point: { x: number; y: number },
  chart: { width: number; height: number },
): { left: string; top: string } {
  return { left: `${(point.x / chart.width) * 100}%`, top: `${(point.y / chart.height) * 100}%` };
}
