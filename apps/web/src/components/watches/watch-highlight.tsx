import Link from 'next/link';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { Freshness } from '@/components/ui/freshness';
import type { WatchDetail } from '@/lib/api/types';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { sortChronologically } from '@/lib/domain/price-history';
import { isAtLowestObservedPrice, isTargetReached } from '@/lib/domain/watch-price';
import styles from './watch-highlight.module.css';

export interface WatchHighlightProps {
  watch: WatchDetail;
}

const CHART_WIDTH = 240;
const CHART_HEIGHT = 72;

/**
 * Card de destaque da home logada: o monitoramento mais relevante agora —
 * preço desejado atingido primeiro, depois menor preço já visto, senão só o
 * mais recente. Nada aqui é inventado: os dois sinais vêm de
 * `lib/domain/watch-price.ts`, já usados no `WatchCard`; a mini-curva é o
 * `priceHistory` real do próprio Watch (mesmo dado de `/watches/:id`).
 */
export function WatchHighlight({ watch }: WatchHighlightProps) {
  const targetReached = isTargetReached(watch);
  const atLowest = isAtLowestObservedPrice(watch);

  const heading = targetReached
    ? 'Preço desejado atingido!'
    : atLowest
      ? 'Menor preço já observado'
      : 'Acompanhando de perto';

  const subtext =
    targetReached && watch.targetAmountMinor !== null && watch.currentPrice
      ? `${formatMoney({
          amountMinor: watch.targetAmountMinor - watch.currentPrice.amountMinor,
          currency: watch.currentPrice.currency,
        })} abaixo do preço que você definiu.`
      : atLowest
        ? 'Esse é o menor preço que o sistema já viu nesta rota.'
        : 'O sistema está observando esta rota de perto.';

  const tripLabel =
    watch.tripType === 'ROUND_TRIP' && watch.returnDate
      ? `${formatDate(watch.departureDate)} → ${formatDate(watch.returnDate)}`
      : formatDate(watch.departureDate);

  const points = sortChronologically(watch.priceHistory);

  return (
    <section className={styles.card} aria-label="Monitoramento em destaque">
      <div className={styles.left}>
        <p className={styles.heading}>{heading}</p>
        <h2 className={styles.route}>
          <RouteLine origin={watch.origin} destination={watch.destination} size="lg" inverse />
        </h2>
        {watch.currentPrice && (
          <p className={`${styles.price} tabular-nums`}>{formatMoney(watch.currentPrice)}</p>
        )}
        <p className={styles.subtext}>{subtext}</p>
        {watch.currentOffer && (
          <Freshness
            observedAt={watch.currentOffer.observedAt}
            expiresAt={watch.currentOffer.expiresAt}
            inverse
          />
        )}

        <div className={styles.actions}>
          {watch.currentOffer ? (
            <PurchaseButton
              href={watch.currentOffer.purchaseUrl}
              status={watch.currentOffer.status}
              watchId={watch.id}
              context={`${watch.origin} para ${watch.destination}`}
              inverse
            />
          ) : null}
          <Link href={`/watches/${watch.id}`} className={styles.detailsLink}>
            Ver detalhes e histórico
          </Link>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.chartBox}>
          {points.length >= 2 ? (
            <Sparkline points={points} />
          ) : (
            <p className={styles.chartEmpty}>Ainda juntando histórico de preço desta rota.</p>
          )}
        </div>
        <div className={styles.stats}>
          <div>
            <p className={styles.statLabel}>Ida</p>
            <p className={styles.statValue}>{tripLabel}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Preço desejado</p>
            <p className={styles.statValue}>
              {watch.targetAmountMinor !== null && watch.currentPrice
                ? formatMoney({
                    amountMinor: watch.targetAmountMinor,
                    currency: watch.currentPrice.currency,
                  })
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sparkline({ points }: { points: WatchDetail['priceHistory'] }) {
  const amounts = points.map((point) => point.amountMinor);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  // Histórico sem nenhuma variação (comum no provedor simulado, que devolve
  // o mesmo preço pra mesma rota+data): centraliza a linha reta em vez de
  // grudar no rodapé do gráfico, o que pareceria uma queda ao chão.
  const flat = max === min;

  function x(index: number): number {
    return (index / (points.length - 1)) * CHART_WIDTH;
  }
  function y(amountMinor: number): number {
    if (flat) return CHART_HEIGHT / 2;
    return CHART_HEIGHT - ((amountMinor - min) / (max - min)) * CHART_HEIGHT;
  }

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.amountMinor)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className={styles.chart}
      role="img"
      aria-label="Histórico de preço observado nesta rota, resumido"
    >
      <path d={line} className={styles.chartLine} />
    </svg>
  );
}
