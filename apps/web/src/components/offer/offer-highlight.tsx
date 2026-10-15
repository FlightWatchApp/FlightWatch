'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';
import type { GetRouteOfferResponse } from '@flight-watch/contracts';
import { PriceByDateChart } from '@/components/charts/price-by-date-chart';
import { searchPromotionDateAction } from '@/components/home/hero-actions';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { RouteLine } from '@/components/brand/route-line';
import { formatDuration, formatStops } from '@/lib/domain/flight-format';
import { formatAbsoluteDateTime, formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { airlineLogoUrl, flightLabel, localDepartureTime } from '@/lib/domain/offer';
import { monthsLabel } from '@/lib/domain/price-chart';
import { promotionAgeLabel, promotionDiscountLabel } from '@/lib/domain/promotion';
import styles from './offer-highlight.module.css';

const CHART_SIZE = { width: 720, height: 200 };

export interface OfferHighlightProps {
  offer: GetRouteOfferResponse & { price: NonNullable<GetRouteOfferResponse['price']> };
  routeHref: string;
  /** Instante da renderização no servidor: a idade não muda na hidratação. */
  renderedAt: string;
}

/**
 * SPEC-038: cartão em destaque da oferta (disposição do mockup "Home Logado",
 * cores do design system). Preço do calendário; o voo é o mais barato que a
 * fonte viu no dia, dito assim — nunca "o voo deste preço".
 */
export function OfferHighlight({ offer, routeHref, renderedAt }: OfferHighlightProps) {
  const [isPending, startTransition] = useTransition();
  const { price, flight, promotion } = offer;
  const priceText = formatMoney({ amountMinor: price.amountMinor, currency: offer.currency });
  const time = flight ? localDepartureTime(flight.departureAt) : null;
  const duration = flight ? formatDuration(flight.durationMinutes) : null;
  const months = [...new Set(offer.days.map((day) => day.date.slice(0, 7)))];
  const context = `${offer.origin.name} para ${offer.destination.name} em ${formatDate(offer.date)}`;

  function monitor(): void {
    const form = new FormData();
    form.set('origin', offer.origin.code);
    form.set('destination', offer.destination.code);
    form.set('departureDate', offer.date);
    startTransition(() => searchPromotionDateAction(form));
  }

  return (
    <>
      <section className={styles.card} aria-label={`Oferta ${context}, ${priceText}`}>
        <div className={styles.left}>
          {promotion && (
            <p className={styles.badge}>{promotionDiscountLabel(promotion.discountBps)}</p>
          )}
          <h1 className={styles.route}>
            <RouteLine
              origin={offer.origin.code}
              destination={offer.destination.code}
              originName={offer.origin.name}
              destinationName={offer.destination.name}
              size="lg"
              inverse
            />
          </h1>
          <p className={styles.trip}>Só ida · {formatDate(offer.date)} · 1 adulto</p>
          <p className={`${styles.price} tabular-nums`}>{priceText}</p>
          <p className={styles.age}>
            {promotionAgeLabel(price.observedAt, new Date(renderedAt)).text}
          </p>

          <div className={styles.actions}>
            {offer.purchaseUrl && (
              <PurchaseButton
                href={offer.purchaseUrl}
                status="CURRENT"
                size="lg"
                context={context}
                inverse
              />
            )}
            <button
              type="button"
              className={styles.secondary}
              onClick={monitor}
              disabled={isPending}
            >
              {isPending ? 'Abrindo…' : 'Monitorar esta passagem'}
            </button>
          </div>
        </div>

        <div className={styles.right}>
          {flight ? (
            <div className={styles.flight}>
              <div className={styles.carrier}>
                <Image
                  src={airlineLogoUrl(flight.carrierCode)}
                  alt=""
                  width={40}
                  height={40}
                  className={styles.logo}
                />
                <div>
                  <p className={styles.carrierName}>{flightLabel(flight)}</p>
                  <p className={styles.flightNote}>Voo mais barato que encontramos neste dia</p>
                </div>
              </div>
              <dl className={styles.stats}>
                <div>
                  <dt>Saída</dt>
                  <dd>{time ?? '—'}</dd>
                </div>
                <div>
                  <dt>Aeroportos</dt>
                  <dd>
                    {flight.originAirport} → {flight.destinationAirport}
                  </dd>
                </div>
                <div>
                  <dt>Duração</dt>
                  <dd>{duration ?? '—'}</dd>
                </div>
                <div>
                  <dt>Escalas</dt>
                  <dd>{formatStops(flight.stops)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <dl className={styles.stats}>
              <div>
                <dt>Escalas</dt>
                <dd>{formatStops(price.stops)}</dd>
              </div>
              <div>
                <dt>Companhia</dt>
                <dd>Ver no site parceiro</dd>
              </div>
            </dl>
          )}
          {offer.nearbyMedianMinor !== null && (
            <p className={styles.nearby}>
              Nas datas próximas, o preço do meio fica em{' '}
              <strong className="tabular-nums">
                {formatMoney({ amountMinor: offer.nearbyMedianMinor, currency: offer.currency })}
              </strong>
              .
            </p>
          )}
        </div>
      </section>

      <p className={styles.notice}>
        Preço visto em agências parceiras em {formatAbsoluteDateTime(price.observedAt)}. No site de
        compra o valor pode ser diferente — confira antes de pagar.
      </p>
      {offer.purchaseUrl && <PurchaseNote />}
      {promotion && <p className={styles.explanation}>{promotion.explanation}</p>}

      {offer.days.length > 1 && (
        <section aria-labelledby="offer-dates">
          <h2 id="offer-dates" className={styles.sectionTitle}>
            Preço nas datas próximas
          </h2>
          <PriceByDateChart
            days={offer.days}
            highlight={{ date: offer.date, amountMinor: price.amountMinor }}
            highlightLabel="esta data"
            referenceAmountMinor={offer.nearbyMedianMinor}
            currency={offer.currency}
            periodLabel={monthsLabel(months)}
            size={CHART_SIZE}
            height="13rem"
          />
        </section>
      )}

      <p>
        <Link href={routeHref} className={styles.routeLink}>
          Ver todas as datas de {offer.origin.name} para {offer.destination.name} →
        </Link>
      </p>
    </>
  );
}
