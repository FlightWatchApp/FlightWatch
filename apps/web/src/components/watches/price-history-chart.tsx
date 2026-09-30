import type { PricePoint } from '@/lib/api/types';
import { formatMoney } from '@/lib/domain/money';
import styles from './price-history-chart.module.css';

export interface PriceHistoryChartProps {
  points: PricePoint[];
  targetAmountMinor: number | null;
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 28;
const INNER_WIDTH = WIDTH - PADDING * 2;
const INNER_HEIGHT = HEIGHT - PADDING * 2;

/**
 * SPEC-009 §7: só a série bruta (sem média móvel/previsão — fora do escopo).
 * SVG desenhado à mão em vez de biblioteca de gráfico: um único polyline com
 * poucas dezenas de pontos não justifica uma nova dependência (AGENTS.md §2).
 */
export function PriceHistoryChart({ points, targetAmountMinor }: PriceHistoryChartProps) {
  if (points.length === 0) {
    return <p className={styles.empty}>Ainda não há preço observado para desenhar o histórico.</p>;
  }

  const currency = points[0]?.currency ?? 'BRL';
  const amounts = points.map((point) => point.amountMinor);
  if (targetAmountMinor !== null) {
    amounts.push(targetAmountMinor);
  }
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const range = max - min || 1;

  function x(index: number): number {
    return points.length === 1
      ? PADDING + INNER_WIDTH / 2
      : PADDING + (index / (points.length - 1)) * INNER_WIDTH;
  }
  function y(amountMinor: number): number {
    return PADDING + INNER_HEIGHT - ((amountMinor - min) / range) * INNER_HEIGHT;
  }

  const linePoints = points.map((point, index) => `${x(index)},${y(point.amountMinor)}`).join(' ');

  return (
    <div className={styles.wrapper}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Histórico de preço observado ao longo do tempo"
        className={styles.svg}
        preserveAspectRatio="none"
      >
        {targetAmountMinor !== null && (
          <>
            <line
              x1={PADDING}
              x2={WIDTH - PADDING}
              y1={y(targetAmountMinor)}
              y2={y(targetAmountMinor)}
              className={styles.targetLine}
            />
            <text
              x={WIDTH - PADDING}
              y={y(targetAmountMinor) - 6}
              className={styles.targetLabel}
              textAnchor="end"
            >
              Meta · {formatMoney({ amountMinor: targetAmountMinor, currency })}
            </text>
          </>
        )}

        {points.length > 1 && <polyline points={linePoints} className={styles.line} fill="none" />}
        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={x(index)}
            cy={y(point.amountMinor)}
            r={3.5}
            className={styles.dot}
          />
        ))}

        <text x={PADDING} y={PADDING - 10} className={styles.axisLabel}>
          {formatMoney({ amountMinor: max, currency })}
        </text>
        <text x={PADDING} y={HEIGHT - PADDING + 16} className={styles.axisLabel}>
          {formatMoney({ amountMinor: min, currency })}
        </text>
      </svg>
    </div>
  );
}
