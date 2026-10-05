import Link from 'next/link';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { IconAlertTriangle, IconChevronRight, IconClock, IconSparkle } from '@/components/ui/icon';
import { StatusTag } from '@/components/ui/status-tag';
import type { WatchSummary } from '@/lib/api/types';
import { formatDate, formatRelativeTime, isStale } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { isAtLowestObservedPrice, isTargetReached } from '@/lib/domain/watch-price';
import { WATCH_STATUS_PRESENTATION } from '@/lib/domain/watch-status';
import styles from './watch-card.module.css';
import { WatchLifecycleActions } from './watch-lifecycle-actions';

export interface WatchCardProps {
  watch: WatchSummary;
}

/**
 * CP-09: cartão de monitoramento. Inativo (pausado ou terminal) fica
 * esmaecido e nunca mostra botão de compra — o preço exibido já não é
 * atualizado, não faz sentido oferecer para comprar a partir dele.
 */
export function WatchCard({ watch }: WatchCardProps) {
  const status = WATCH_STATUS_PRESENTATION[watch.status];
  const atLowest = isAtLowestObservedPrice(watch);
  const targetReached = isTargetReached(watch);
  const inactive = watch.status !== 'ACTIVE';
  const stale = watch.lastCheck ? isStale(watch.lastCheck.at) : true;
  const tripLabel =
    watch.tripType === 'ROUND_TRIP' && watch.returnDate
      ? `${formatDate(watch.departureDate)} → ${formatDate(watch.returnDate)}`
      : `Só ida · ${formatDate(watch.departureDate)}`;
  const price = watch.currentPrice ? formatMoney(watch.currentPrice) : null;

  return (
    <article className={`${styles.card} ${inactive ? styles.inactive : ''}`}>
      <div className={styles.top}>
        <Link href={`/watches/${watch.id}`} className={styles.routeLink}>
          <RouteLine origin={watch.origin} destination={watch.destination} size="sm" />
          <IconChevronRight size={18} className={styles.chevron} />
          <span className="visually-hidden">Ver detalhes e histórico</span>
        </Link>
        <StatusTag tone={status.tone} label={status.label} />
      </div>
      <p className={styles.trip}>{tripLabel}</p>

      <div className={styles.prices}>
        <div>
          <p className={styles.priceLabel}>Último preço observado</p>
          <p className={`${styles.price} tabular-nums`}>{price ?? '—'}</p>
        </div>
        {watch.targetAmountMinor !== null && (
          <div>
            <p className={styles.priceLabel}>Preço desejado</p>
            <p className={`${styles.target} tabular-nums`}>
              {formatMoney({ amountMinor: watch.targetAmountMinor, currency: watch.currency })}
            </p>
          </div>
        )}
      </div>

      {(targetReached || atLowest) && (
        <div className={styles.highlights}>
          {targetReached && <span className={styles.highlightStrong}>Preço desejado atingido</span>}
          {atLowest && (
            <span className={styles.highlight}>
              <IconSparkle size={12} />
              Menor preço já observado
            </span>
          )}
        </div>
      )}

      <p className={`${styles.freshness} ${stale && !inactive ? styles.stale : ''}`}>
        {stale && !inactive ? <IconAlertTriangle size={14} /> : <IconClock size={14} />}
        {watch.lastCheck
          ? `Verificado ${formatRelativeTime(watch.lastCheck.at)}`
          : 'Aguardando a primeira verificação'}
      </p>

      <div className={styles.actions}>
        {watch.currentOffer && !inactive && (
          <PurchaseButton
            href={watch.currentOffer.purchaseUrl}
            status={watch.currentOffer.status}
            size="sm"
            watchId={watch.id}
            context={`${watch.origin} para ${watch.destination}${price ? ` por ${price}` : ''}`}
          />
        )}
        <WatchLifecycleActions watchId={watch.id} status={watch.status} />
      </div>
    </article>
  );
}
