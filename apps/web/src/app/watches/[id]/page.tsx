import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RouteLine } from '@/components/brand/route-line';
import { FlightSummary } from '@/components/offer/flight-summary';
import { RouteFacts } from '@/components/route/route-facts';
import { RouteSummary } from '@/components/route/route-summary';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { Card } from '@/components/ui/card';
import { Freshness } from '@/components/ui/freshness';
import { IconClock, IconSparkle } from '@/components/ui/icon';
import { StatusTag } from '@/components/ui/status-tag';
import { PriceHistoryChart } from '@/components/watches/price-history-chart';
import { WatchLifecycleActions } from '@/components/watches/watch-lifecycle-actions';
import { ApiError } from '@/lib/api/client';
import { getRouteFacts, getRouteOffer } from '@/lib/api/routes';
import { getWatch } from '@/lib/api/watches';
import { formatDate, formatRelativeTime, isStale } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { isAtLowestObservedPrice, isBelowTypicalPrice } from '@/lib/domain/watch-price';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import { routePath } from '@/lib/domain/route-url';
import { WATCH_STATUS_PRESENTATION } from '@/lib/domain/watch-status';
import styles from './page.module.css';

/** Data de viagem já passada (UTC, sem fuso: CLAUDE.md §8.2). */
function isPastDate(date: string): boolean {
  return date < new Date().toISOString().slice(0, 10);
}

/** SPEC-033: página privada, fora do Google. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

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

  // Mesmo cabeçalho de rota da página pública (SPEC-033 fatia 5). Fatos do catálogo, sem
  // preço: se falhar, o monitoramento continua útil sem o mapa.
  const routeFacts = await getRouteFacts(watch.origin, watch.destination).catch(() => null);
  // SPEC-038: voo mais barato que a fonte viu no dia (só ida, com a página da rota ligada).
  // Falha ou dia sem detalhe: a página segue sem o bloco.
  const flight =
    routePagesEnabled() && watch.tripType === 'ONE_WAY' && !isPastDate(watch.departureDate)
      ? await getRouteOffer(watch.origin, watch.destination, watch.departureDate)
          .then((offer) => offer.flight)
          .catch(() => null)
      : null;

  const status = WATCH_STATUS_PRESENTATION[watch.status];
  const hasLifecycleActions = watch.status === 'ACTIVE' || watch.status === 'PAUSED';
  const inactive = watch.status !== 'ACTIVE';
  const stale = watch.lastCheck ? isStale(watch.lastCheck.at) : true;
  const belowTypical = isBelowTypicalPrice(watch);
  const lowPrice = watch.lowPrice;
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

      {routeFacts && (
        <>
          <RouteSummary origin={routeFacts.origin} destination={routeFacts.destination} />
          {routePagesEnabled() && (
            <p className={styles.subtitle}>
              <Link href={routePath(routeFacts.origin, routeFacts.destination)} prefetch={false}>
                Ver a página da rota
              </Link>
            </p>
          )}
        </>
      )}

      <Card>
        <div className={styles.priceRow}>
          <div>
            <p className={styles.priceLabel}>Último preço observado</p>
            <p className={`${styles.price} tabular-nums`}>
              {watch.currentPrice ? formatMoney(watch.currentPrice) : '—'}
            </p>
          </div>
        </div>

        {(belowTypical || atLowest) && (
          <div className={styles.highlights}>
            {belowTypical && <span className={styles.highlightStrong}>Bem abaixo do normal</span>}
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
          {lowPrice && (
            <div>
              <dt>Preço normal</dt>
              <dd className="tabular-nums">
                {lowPrice.typicalAmountMinor !== null
                  ? formatMoney({
                      amountMinor: lowPrice.typicalAmountMinor,
                      currency: watch.currency,
                    })
                  : 'Ainda calculando'}
              </dd>
            </div>
          )}
        </dl>

        {flight && <FlightSummary flight={flight} />}

        {lowPrice && (
          <p className={styles.alertRule}>
            {lowPrice.typicalSource === 'HISTORY'
              ? 'Preço normal calculado com os preços que observamos nos últimos 30 dias. '
              : lowPrice.typicalSource === 'NEARBY_DATES'
                ? 'Preço normal calculado com os preços das datas próximas desta rota. '
                : ''}
            Avisamos por e-mail quando observarmos um preço pelo menos {lowPrice.dropPercent}%
            abaixo do normal ou o menor preço já observado pelo Flight Watch para esta viagem.
          </p>
        )}

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
          typicalAmountMinor={lowPrice?.typicalAmountMinor ?? null}
        />
      </Card>
      {routeFacts && <RouteFacts {...routeFacts} />}
    </div>
  );
}
