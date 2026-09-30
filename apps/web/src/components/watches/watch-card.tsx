import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { IconAlertTriangle, IconArrowDownRight, IconClock, IconRoute } from '@/components/ui/icon';
import { StatusTag } from '@/components/ui/status-tag';
import type { WatchSummary } from '@/lib/api/types';
import { formatDate, formatRelativeTime, isStale } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { isAtLowestObservedPrice } from '@/lib/domain/watch-price';
import { WATCH_STATUS_PRESENTATION } from '@/lib/domain/watch-status';
import { PurchaseLinkButton } from './purchase-link-button';
import styles from './watch-card.module.css';
import { WatchLifecycleActions } from './watch-lifecycle-actions';

export interface WatchCardProps {
  watch: WatchSummary;
}

export function WatchCard({ watch }: WatchCardProps) {
  const status = WATCH_STATUS_PRESENTATION[watch.status];
  const atLowest = isAtLowestObservedPrice(watch);
  const stale = watch.lastCheck ? isStale(watch.lastCheck.at) : true;
  const hasLifecycleActions = watch.status === 'ACTIVE' || watch.status === 'PAUSED';
  const tripLabel =
    watch.tripType === 'ROUND_TRIP' && watch.returnDate
      ? `${formatDate(watch.departureDate)} → ${formatDate(watch.returnDate)}`
      : `Só ida · ${formatDate(watch.departureDate)}`;

  return (
    <Card>
      <div className={styles.top}>
        <Link href={`/watches/${watch.id}`} className={styles.route}>
          {watch.origin}
          <IconRoute size={16} className={styles.routeIcon} />
          {watch.destination}
        </Link>
        <StatusTag tone={status.tone} label={status.label} />
      </div>

      <div className={styles.priceRow}>
        <div>
          <p className={styles.priceLabel}>Preço atual</p>
          <p className={styles.price}>
            {watch.currentPrice ? formatMoney(watch.currentPrice) : '—'}
            {atLowest && (
              <>
                <IconArrowDownRight size={16} className={styles.priceDropIcon} />
                <span className="visually-hidden">Menor preço já visto</span>
              </>
            )}
          </p>
        </div>
        {watch.targetAmountMinor !== null && (
          <div>
            <p className={styles.priceLabel}>Meta</p>
            <p className={styles.target}>
              {formatMoney({ amountMinor: watch.targetAmountMinor, currency: watch.currency })}
            </p>
          </div>
        )}
      </div>

      <div className={styles.meta}>
        <span>{tripLabel}</span>
        <span className={`${styles.freshness} ${stale ? styles.stale : ''}`}>
          {stale ? <IconAlertTriangle size={14} /> : <IconClock size={14} />}
          {watch.lastCheck ? formatRelativeTime(watch.lastCheck.at) : 'Ainda sem verificação'}
        </span>
      </div>

      {(watch.currentOffer || hasLifecycleActions) && (
        <div className={styles.actionsRow}>
          {watch.currentOffer && (
            <PurchaseLinkButton watchId={watch.id} currentOffer={watch.currentOffer} size="sm" />
          )}
          <WatchLifecycleActions watchId={watch.id} status={watch.status} />
        </div>
      )}
    </Card>
  );
}
