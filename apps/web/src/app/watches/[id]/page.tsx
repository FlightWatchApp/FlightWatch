import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { Card } from '@/components/ui/card';
import { Freshness } from '@/components/ui/freshness';
import { IconClock, IconSparkle } from '@/components/ui/icon';
import { StatusTag } from '@/components/ui/status-tag';
import { PriceHistoryChart } from '@/components/watches/price-history-chart';
import { WatchLifecycleActions } from '@/components/watches/watch-lifecycle-actions';
import { ApiError } from '@/lib/api/client';
import { getWatch } from '@/lib/api/watches';
import { formatDate, formatRelativeTime, isStale } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { isAtLowestObservedPrice, isTargetReached } from '@/lib/domain/watch-price';
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
  const inactive = watch.status !== 'ACTIVE';
  const stale = watch.lastCheck ? isStale(watch.lastCheck.at) : true;
  const targetReached = isTargetReached(watch);
  const atLowest = isAtLowestObservedPrice(watch);
  // PG-06: a linha "Última verificação" só aparece quando não repetiria o
  // Freshness da oferta atual — sem oferta, inativo ou dado velho.
  const showLastCheck = !watch.currentOffer || inactive || stale;
  const tripLabel =
    watch.tripType === 'ROUND_TRIP' && watch.returnDate
      ? `${formatDate(watch.departureDate)} → ${formatDate(watch.returnDate)}`
      : `Só ida · ${formatDate(watch.departureDate)}`;

  return (
    <div className={`container ${styles.page}`}>
      <Link href="/watches" className={styles.back}>
        ← Voltar
      </Link>

      <div className={styles.header}>
        <div>
          <h1>
            <RouteLine
              origin={watch.origin}
              destination={watch.destination}
              originName={watch.originName}
              destinationName={watch.destinationName}
              size="lg"
              animated
            />
          </h1>
          <p className={styles.subtitle}>{tripLabel}</p>
        </div>
        <StatusTag tone={status.tone} label={status.label} />
      </div>

      <Card>
        <div className={styles.priceRow}>
          <div>
            <p className={styles.priceLabel}>Último preço observado</p>
            <p className={`${styles.price} tabular-nums`}>
              {watch.currentPrice ? formatMoney(watch.currentPrice) : '—'}
            </p>
          </div>
        </div>

        {(targetReached || atLowest) && (
          <div className={styles.highlights}>
            {targetReached && (
              <span className={styles.highlightStrong}>Preço desejado atingido</span>
            )}
            {atLowest && (
              <span className={styles.highlight}>
                <IconSparkle size={12} />
                Menor preço já observado
              </span>
            )}
          </div>
        )}

        <dl className={styles.dl}>
          <div>
            <dt>Menor preço observado</dt>
            <dd className="tabular-nums">
              {watch.lowestPrice ? formatMoney(watch.lowestPrice) : '—'}
            </dd>
          </div>
          {watch.targetAmountMinor !== null && (
            <div>
              <dt>Preço desejado</dt>
              <dd className="tabular-nums">
                {formatMoney({ amountMinor: watch.targetAmountMinor, currency: watch.currency })}
              </dd>
            </div>
          )}
        </dl>

        {watch.currentOffer && (
          <Freshness
            observedAt={watch.currentOffer.observedAt}
            expiresAt={watch.currentOffer.expiresAt}
          />
        )}
        {showLastCheck && (
          <p className={styles.lastCheck}>
            <IconClock size={14} />
            {watch.lastCheck
              ? `Última verificação ${formatRelativeTime(watch.lastCheck.at)}`
              : 'Aguardando a primeira verificação'}
          </p>
        )}

        {(watch.currentOffer || hasLifecycleActions) && (
          <div className={styles.actionsRow}>
            {watch.currentOffer && !inactive && (
              <PurchaseButton
                href={watch.currentOffer.purchaseUrl}
                status={watch.currentOffer.status}
                size="lg"
                fullWidth
                watchId={watch.id}
                context={`${watch.origin} para ${watch.destination}`}
              />
            )}
            <WatchLifecycleActions watchId={watch.id} status={watch.status} />
          </div>
        )}
        {watch.currentOffer && !inactive && <PurchaseNote />}
      </Card>

      <Card>
        <h2 className={styles.chartTitle}>Histórico de preço</h2>
        <p className={styles.chartSubtitle}>O eixo não começa em zero.</p>
        <PriceHistoryChart
          points={watch.priceHistory}
          targetAmountMinor={watch.targetAmountMinor}
        />
      </Card>
    </div>
  );
}
