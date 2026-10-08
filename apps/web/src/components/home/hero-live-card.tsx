'use client';

import { type KeyboardEvent, type PointerEvent, useMemo, useState } from 'react';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { formatMoney } from '@/lib/domain/money';
import {
  buildPriceChart,
  chartMoney,
  monthsLabel,
  nearestPointIndex,
  pointLabel,
  priceChartSummary,
  shortDate,
} from '@/lib/domain/price-chart';
import { promotionAgeLabel, promotionDiscountLabel } from '@/lib/domain/promotion';
import { searchPromotionDateAction } from './hero-actions';
import type { HeroPromotion } from './hero-promotion';
import styles from './hero-illustration.module.css';

const CHART = { width: 280, height: 150, padding: 10 };

/**
 * SPEC-032: cartão da página inicial com a melhor promoção saindo da origem
 * da pessoa. O gráfico é "preço por data" (calendário da SPEC-031), não
 * histórico: cada ponto é uma data de viagem, a data da promoção vem
 * marcada e a mediana de referência fica tracejada — o gráfico mostra o
 * motivo do "X% abaixo das datas próximas".
 */
export function HeroLiveCard({ live }: { live: HeroPromotion }) {
  const { promotion, origin, originName } = live;
  const currency = promotion.price.currency;
  const chart = useMemo(
    () =>
      buildPriceChart(live.days, {
        ...CHART,
        highlight: { date: promotion.departureDate, amountMinor: promotion.price.amountMinor },
        referenceAmountMinor: promotion.reference.amountMinor,
      }),
    [
      live.days,
      promotion.departureDate,
      promotion.price.amountMinor,
      promotion.reference.amountMinor,
    ],
  );
  const [active, setActive] = useState<number | null>(null);

  const age = promotionAgeLabel(promotion.observedAt, new Date(live.renderedAt));
  const priceText = formatMoney(promotion.price);
  const period = monthsLabel(promotion.reference.months);
  const activePoint = chart && active !== null ? chart.points[active] : null;
  const shownPoint = activePoint ?? chart?.highlighted ?? null;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CHART.width;
    setActive(nearestPointIndex(chart.points, x));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!chart) return;
    const start = active ?? chart.points.findIndex((point) => point.highlighted);
    const current = start < 0 ? 0 : start;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive(Math.min(chart.points.length - 1, current + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive(Math.max(0, current - 1));
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  }

  return (
    <div className={styles.slot} data-position="front">
      <article
        className={styles.card}
        aria-label={`Promoção saindo de ${originName} para ${promotion.destinationName}, ${priceText}`}
      >
        <div className={styles.cardHead}>
          <span className={styles.example}>Saindo de {originName}</span>
          <span className={styles.badge}>{promotionDiscountLabel(promotion.discountBps)}</span>
        </div>

        <div className={styles.route}>
          <span className="iata">{origin}</span>
          <svg viewBox="0 0 160 40" className={styles.routeArc} aria-hidden="true">
            <circle cx="6" cy="32" r="4.5" className={styles.dotOrigin} />
            <path d="M12 32 Q 80 -8 148 32" pathLength={1} className={styles.routePath} />
            <circle cx="154" cy="32" r="4.5" className={styles.dotDestination} />
          </svg>
          <span className="iata">{promotion.destination}</span>
        </div>
        <p className={styles.routeNames}>
          {originName} → {promotion.destinationName}
        </p>

        <div className={styles.priceRow}>
          <div>
            <span className={styles.label}>
              Menor preço observado · {shortDate(promotion.departureDate)}
              {promotion.returnDate ? ` → ${shortDate(promotion.returnDate)}` : ' · só ida'}
            </span>
            <span className={styles.price}>{priceText}</span>
          </div>
          <span className={`${styles.age} ${age.aging ? styles.aging : ''}`.trim()}>
            {age.text}
          </span>
        </div>

        {chart ? (
          // Setas escolhem a data: papel de slider, com a data e o preço no valor.
          <div
            className={styles.chartWrap}
            tabIndex={0}
            role="slider"
            aria-label={`Preço por data, ${period}`}
            aria-valuemin={1}
            aria-valuemax={chart.points.length}
            aria-valuenow={(shownPoint ? chart.points.indexOf(shownPoint) : 0) + 1}
            aria-valuetext={
              shownPoint
                ? `${pointLabel(shownPoint, currency)}${shownPoint.highlighted ? ', data da promoção' : ''}`
                : undefined
            }
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
          >
            <svg
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              className={styles.chart}
              aria-hidden="true"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setActive(null)}
            >
              <defs>
                <linearGradient id="fw-hero-live-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.14" />
                  <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={chart.areaPath} fill="url(#fw-hero-live-area)" className={styles.area} />
              {chart.referenceY !== null && (
                <line
                  x1={CHART.padding}
                  x2={CHART.width - CHART.padding}
                  y1={chart.referenceY}
                  y2={chart.referenceY}
                  className={styles.referenceLine}
                />
              )}
              <path d={chart.linePath} pathLength={1} className={styles.line} />
              {activePoint && (
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={CHART.padding}
                  y2={CHART.height - CHART.padding}
                  className={styles.cursor}
                />
              )}
              {chart.highlighted && (
                <circle
                  cx={chart.highlighted.x}
                  cy={chart.highlighted.y}
                  r="6"
                  className={styles.lastPoint}
                />
              )}
              {activePoint && !activePoint.highlighted && (
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="4.5"
                  className={styles.activePoint}
                />
              )}
            </svg>
            {shownPoint && (
              <span
                className={styles.tooltip}
                style={{ left: `${(shownPoint.x / CHART.width) * 100}%` }}
                aria-hidden="true"
              >
                {pointLabel(shownPoint, currency)}
                {shownPoint.highlighted ? ' · promoção' : ''}
              </span>
            )}
            <p className={styles.chartCaption}>
              Preço por data, {period}
              {chart.referenceAmountMinor !== null &&
                ` · tracejado: mediana das datas próximas (${chartMoney(chart.referenceAmountMinor, currency)})`}
            </p>
            <p className="visually-hidden">{priceChartSummary(chart, currency)}</p>
          </div>
        ) : (
          <p className={styles.chartCaption}>{promotion.reference.explanation}</p>
        )}

        <div className={styles.actions}>
          {promotion.purchaseUrl && (
            <PurchaseButton
              href={promotion.purchaseUrl}
              status="CURRENT"
              size="sm"
              label="Ver no site parceiro"
              context={`${originName} para ${promotion.destinationName} por ${priceText}`}
            />
          )}
          <form action={searchPromotionDateAction}>
            <input type="hidden" name="origin" value={origin} />
            <input type="hidden" name="destination" value={promotion.destination} />
            <input type="hidden" name="departureDate" value={promotion.departureDate} />
            <input type="hidden" name="returnDate" value={promotion.returnDate ?? ''} />
            <button type="submit" className={styles.watchButton}>
              Ver voo e monitorar
            </button>
          </form>
        </div>
      </article>
    </div>
  );
}
