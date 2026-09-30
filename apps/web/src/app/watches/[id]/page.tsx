import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { IconArrowDownRight, IconClock, IconRoute } from '@/components/ui/icon';
import { StatusTag } from '@/components/ui/status-tag';
import { PriceHistoryChart } from '@/components/watches/price-history-chart';
import { PurchaseLinkButton } from '@/components/watches/purchase-link-button';
import { WatchLifecycleActions } from '@/components/watches/watch-lifecycle-actions';
import { ApiError } from '@/lib/api/client';
import { getWatch } from '@/lib/api/watches';
import { formatDate, formatRelativeTime } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { WATCH_STATUS_PRESENTATION } from '@/lib/domain/watch-status';
import styles from './page.module.css';

export default async function WatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let watch;
  try {
    watch = await getWatch(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const status = WATCH_STATUS_PRESENTATION[watch.status];
  const hasLifecycleActions = watch.status === 'ACTIVE' || watch.status === 'PAUSED';
  const tripLabel =
    watch.tripType === 'ROUND_TRIP' && watch.returnDate
      ? `${formatDate(watch.departureDate)} → ${formatDate(watch.returnDate)}`
      : `Só ida · ${formatDate(watch.departureDate)}`;

  return (
    <div className={`container ${styles.page}`}>
      <Link href="/" className={styles.back}>
        ← Voltar
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.route}>
            {watch.origin}
            <IconRoute size={18} className={styles.routeIcon} />
            {watch.destination}
          </span>
          <p className={styles.subtitle}>{tripLabel}</p>
        </div>
        <StatusTag tone={status.tone} label={status.label} />
      </div>

      <Card>
        <div className={styles.priceRow}>
          <div>
            <p className={styles.priceLabel}>Preço atual</p>
            <p className={styles.price}>
              {watch.currentPrice ? formatMoney(watch.currentPrice) : '—'}
            </p>
          </div>
          <div>
            <p className={styles.priceLabel}>Menor já visto</p>
            <p className={styles.priceSecondary}>
              {watch.lowestPrice ? (
                <>
                  <IconArrowDownRight size={16} className={styles.lowestIcon} />
                  {formatMoney(watch.lowestPrice)}
                </>
              ) : (
                '—'
              )}
            </p>
          </div>
          {watch.targetAmountMinor !== null && (
            <div>
              <p className={styles.priceLabel}>Meta</p>
              <p className={styles.priceSecondary}>
                {formatMoney({ amountMinor: watch.targetAmountMinor, currency: watch.currency })}
              </p>
            </div>
          )}
        </div>

        <p className={styles.lastCheck}>
          <IconClock size={14} />
          {watch.lastCheck
            ? `Última consulta ${formatRelativeTime(watch.lastCheck.at)}`
            : 'Ainda sem verificação concluída'}
        </p>

        {(watch.currentOffer || hasLifecycleActions) && (
          <div className={styles.actionsRow}>
            {watch.currentOffer && (
              <PurchaseLinkButton watchId={watch.id} currentOffer={watch.currentOffer} />
            )}
            <WatchLifecycleActions watchId={watch.id} status={watch.status} />
          </div>
        )}
      </Card>

      <Card>
        <h2 className={styles.chartTitle}>Histórico de preço</h2>
        <PriceHistoryChart
          points={watch.priceHistory}
          targetAmountMinor={watch.targetAmountMinor}
        />
      </Card>
    </div>
  );
}
