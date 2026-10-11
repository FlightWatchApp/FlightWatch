'use client';

import Link from 'next/link';
import { PriceByDateChart } from '@/components/charts/price-by-date-chart';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { formatMoney } from '@/lib/domain/money';
import { monthsLabel, shortDate } from '@/lib/domain/price-chart';
import { promotionAgeLabel, promotionDiscountLabel } from '@/lib/domain/promotion';
import { searchPromotionDateAction } from './hero-actions';
import type { HeroPromotion } from './hero-promotion';
import styles from './hero-illustration.module.css';

/**
 * SPEC-032: cartão da página inicial com a melhor promoção saindo da origem
 * da pessoa. O gráfico é "preço por data" (calendário da SPEC-031), não
 * histórico: cada ponto é uma data de viagem, a data da promoção vem
 * marcada e a mediana de referência fica tracejada — o gráfico mostra o
 * motivo do "X% abaixo das datas próximas".
 */
export function HeroLiveCard({ live }: { live: HeroPromotion }) {
  const { promotion, origin, originName } = live;
  const age = promotionAgeLabel(promotion.observedAt, new Date(live.renderedAt));
  const priceText = formatMoney(promotion.price);

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

        {live.days.length > 0 ? (
          <PriceByDateChart
            days={live.days}
            highlight={{ date: promotion.departureDate, amountMinor: promotion.price.amountMinor }}
            highlightLabel="promoção"
            referenceAmountMinor={promotion.reference.amountMinor}
            currency={promotion.price.currency}
            periodLabel={monthsLabel(promotion.reference.months)}
          />
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
        {live.routeHref && (
          <Link href={live.routeHref} className={styles.routeLink} prefetch={false}>
            Ver a rota {originName} → {promotion.destinationName}
          </Link>
        )}
      </article>
    </div>
  );
}
