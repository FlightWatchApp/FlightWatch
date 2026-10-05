'use client';

import Link from 'next/link';
import { PriceHistoryChart } from '@/components/watches/price-history-chart';
import { RouteLine } from '@/components/brand/route-line';
import { Button } from '@/components/ui/button';
import { Freshness } from '@/components/ui/freshness';
import { IconCheckCircle, IconClock } from '@/components/ui/icon';
import type { WatchDetail } from '@/lib/api/types';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import styles from './watch-created-summary.module.css';

export interface WatchCreatedSummaryProps {
  watch: WatchDetail;
  onClose: () => void;
}

export function WatchCreatedSummary({ watch, onClose }: WatchCreatedSummaryProps) {
  const tripLabel =
    watch.tripType === 'ROUND_TRIP' && watch.returnDate
      ? `${formatDate(watch.departureDate)} → ${formatDate(watch.returnDate)}`
      : `Só ida · ${formatDate(watch.departureDate)}`;

  return (
    <div className={styles.summary}>
      <div className={styles.successMessage}>
        <IconCheckCircle size={18} />
        <div>
          <strong>Monitoramento criado</strong>
          <span>Vamos acompanhar essa rota e avisar quando o preço atingir sua meta.</span>
        </div>
      </div>

      <div className={styles.route}>
        <RouteLine origin={watch.origin} destination={watch.destination} size="lg" showCities />
        <p className={styles.trip}>
          <IconClock size={14} /> {tripLabel}
        </p>
      </div>

      <div className={styles.metrics}>
        <div>
          <span>Preço atual</span>
          <strong>
            {watch.currentPrice ? formatMoney(watch.currentPrice) : 'Aguardando verificação'}
          </strong>
        </div>
        <div>
          <span>Preço desejado</span>
          <strong>
            {watch.targetAmountMinor !== null
              ? formatMoney({ amountMinor: watch.targetAmountMinor, currency: watch.currency })
              : 'Sem meta definida'}
          </strong>
        </div>
        {watch.lowestPrice && (
          <div>
            <span>Menor preço observado</span>
            <strong>{formatMoney(watch.lowestPrice)}</strong>
          </div>
        )}
      </div>

      {watch.currentOffer && (
        <Freshness
          observedAt={watch.currentOffer.observedAt}
          expiresAt={watch.currentOffer.expiresAt}
          prefix="Última verificação"
        />
      )}

      <section className={styles.history} aria-labelledby="watch-history-title">
        <div className={styles.historyHeading}>
          <div>
            <p className={styles.eyebrow}>Acompanhamento</p>
            <h3 id="watch-history-title">Histórico de preço</h3>
          </div>
          <span>{watch.priceHistory.length} observações</span>
        </div>
        <PriceHistoryChart
          points={watch.priceHistory}
          targetAmountMinor={watch.targetAmountMinor}
        />
      </section>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Continuar navegando
        </Button>
        <Link href="/watches" className={styles.viewWatches} onClick={onClose}>
          Ver meus monitoramentos
        </Link>
      </div>
    </div>
  );
}
