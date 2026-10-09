'use client';

import { useTransition } from 'react';
import type { GetRouteResponse } from '@flight-watch/contracts';
import { PriceByDateChart } from '@/components/charts/price-by-date-chart';
import { searchPromotionDateAction } from '@/components/home/hero-actions';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { formatMoney } from '@/lib/domain/money';
import { monthsLabel, shortDate } from '@/lib/domain/price-chart';
import { promotionAgeLabel, promotionDiscountLabel } from '@/lib/domain/promotion';
import { cheapestDates, routePriceNotice } from '@/lib/domain/route-page';
import styles from './route-page.module.css';

/** Largo e baixo: a página tem a largura toda; o cartão inicial usa o padrão. */
const CHART_SIZE = { width: 720, height: 200 };

export interface RoutePricesProps {
  route: GetRouteResponse;
  /** Instante da renderização no servidor: a idade não muda na hidratação. */
  renderedAt: string;
}

/**
 * SPEC-033: o bloco que a FlightConnections não tem — menor preço, promoção
 * da rota (só do cache), preço por data e as datas mais baratas. Escolher
 * uma data abre a busca dela (SPEC-014), onde o monitoramento já existe.
 */
export function RoutePrices({ route, renderedAt }: RoutePricesProps) {
  const [isPending, startTransition] = useTransition();
  const { prices, promotion } = route;
  const notice = routePriceNotice(prices.status);
  const cheapest = prices.cheapest;
  const best = cheapestDates(prices.days, 5);

  function searchDate(date: string): void {
    const form = new FormData();
    form.set('origin', route.origin.code);
    form.set('destination', route.destination.code);
    form.set('departureDate', date);
    startTransition(() => searchPromotionDateAction(form));
  }

  return (
    <section className={styles.prices} aria-labelledby="route-prices" aria-busy={isPending}>
      <h2 id="route-prices" className={styles.sectionTitle}>
        Preços de {route.origin.name} para {route.destination.name}
      </h2>

      {cheapest && (
        <div className={styles.cheapest}>
          <p className={styles.cheapestLabel}>
            Menor preço observado pelo sistema · {shortDate(cheapest.date)} · só ida
          </p>
          <p className={`${styles.cheapestPrice} tabular-nums`}>
            {formatMoney({ amountMinor: cheapest.amountMinor, currency: prices.currency })}
          </p>
          <p className={styles.age}>
            {promotionAgeLabel(cheapest.observedAt, new Date(renderedAt)).text}
          </p>
        </div>
      )}

      {promotion && (
        <p className={styles.promotion}>
          <span className={styles.badge}>{promotionDiscountLabel(promotion.discountBps)}</span>{' '}
          {promotion.explanation}
        </p>
      )}

      {notice && <p className={styles.notice}>{notice}</p>}

      {prices.days.length > 0 && (
        <PriceByDateChart
          days={prices.days}
          highlight={cheapest ? { date: cheapest.date, amountMinor: cheapest.amountMinor } : null}
          highlightLabel="mais barato"
          referenceAmountMinor={prices.referenceMedianMinor}
          currency={prices.currency}
          periodLabel={monthsLabel(prices.months)}
          onChoose={searchDate}
          size={CHART_SIZE}
          height="13rem"
        />
      )}

      {best.length > 0 && (
        <div>
          <h3 className={styles.subTitle}>Datas mais baratas</h3>
          <ul className={styles.dates}>
            {best.map((day) => (
              <li key={day.date}>
                <button
                  type="button"
                  className={styles.dateButton}
                  onClick={() => searchDate(day.date)}
                  disabled={isPending}
                >
                  <span>{shortDate(day.date)}</span>
                  <strong className="tabular-nums">
                    {formatMoney({ amountMinor: day.amountMinor, currency: prices.currency })}
                  </strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.actions}>
        {route.allFlightsUrl && (
          <PurchaseButton
            href={route.allFlightsUrl}
            status="CURRENT"
            label="Ver todos os voos no site parceiro"
            context={`${route.origin.name} para ${route.destination.name}`}
          />
        )}
        {cheapest && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => searchDate(cheapest.date)}
            disabled={isPending}
          >
            {isPending ? 'Buscando…' : 'Monitorar esta rota'}
          </button>
        )}
      </div>
      {route.allFlightsUrl && <PurchaseNote />}
    </section>
  );
}
