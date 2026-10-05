import type { PricePoint } from '@/lib/api/types';
import { formatAbsoluteDateTime } from '@/lib/domain/freshness';
import { formatMoney, formatMoneyRounded } from '@/lib/domain/money';
import { indexOfLowest, sortChronologically } from '@/lib/domain/price-history';
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
 * SPEC-009 §7/CP-10: só a série bruta (sem média móvel/previsão — fora do
 * escopo). SVG desenhado à mão em vez de biblioteca de gráfico: um único
 * polyline com poucas dezenas de pontos não justifica uma nova dependência
 * (AGENTS.md §2). A API devolve o histórico do mais novo para o mais antigo
 * — `sortChronologically` inverte antes de desenhar, senão a linha sai ao
 * contrário sem nenhum erro visível (CP-10, testado em `lib/domain`).
 */
export function PriceHistoryChart({
  points: rawPoints,
  targetAmountMinor,
}: PriceHistoryChartProps) {
  if (rawPoints.length === 0) {
    return <p className={styles.empty}>Ainda não há preço observado para desenhar o histórico.</p>;
  }

  const points = sortChronologically(rawPoints);
  const lowestIndex = indexOfLowest(points);
  const lastIndex = points.length - 1;

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
  const areaPoints = `${PADDING},${PADDING + INNER_HEIGHT} ${linePoints} ${WIDTH - PADDING},${PADDING + INNER_HEIGHT}`;

  return (
    <div className={styles.wrapper}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Histórico de preço observado ao longo do tempo"
        className={styles.svg}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="fw-chart-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-action)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--color-action)" stopOpacity="0" />
          </linearGradient>
        </defs>

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
              Preço desejado · {formatMoney({ amountMinor: targetAmountMinor, currency })}
            </text>
          </>
        )}

        {points.length > 1 && (
          <>
            <polygon points={areaPoints} className={styles.area} />
            <polyline points={linePoints} pathLength={1} className={styles.line} fill="none" />
          </>
        )}
        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={x(index)}
            cy={y(point.amountMinor)}
            r={index === lastIndex ? 6 : index === lowestIndex ? 5 : 3.5}
            className={
              index === lastIndex
                ? styles.dotLast
                : index === lowestIndex
                  ? styles.dotLowest
                  : styles.dot
            }
          >
            <title>{`${formatAbsoluteDateTime(point.observedAt)}: ${formatMoney({ amountMinor: point.amountMinor, currency: point.currency })}`}</title>
          </circle>
        ))}

        <text x={PADDING} y={PADDING - 10} className={styles.axisLabel}>
          {formatMoneyRounded({ amountMinor: max, currency })}
        </text>
        <text x={PADDING} y={HEIGHT - PADDING + 16} className={styles.axisLabel}>
          {formatMoneyRounded({ amountMinor: min, currency })}
        </text>
      </svg>

      <details className={styles.table}>
        <summary>Ver histórico em tabela ({points.length})</summary>
        <div role="region" aria-label="Histórico de preço em tabela">
          <table>
            <thead>
              <tr>
                <th scope="col">Observado em</th>
                <th scope="col">Preço</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.id}>
                  <td>{formatAbsoluteDateTime(point.observedAt)}</td>
                  <td className="tabular-nums">
                    {formatMoney({ amountMinor: point.amountMinor, currency: point.currency })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
