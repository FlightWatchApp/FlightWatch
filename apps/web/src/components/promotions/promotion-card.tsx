import Image from 'next/image';
import type { PromotionItem, RouteOfferFlight } from '@flight-watch/contracts';
import { RouteLine } from '@/components/brand/route-line';
import { ViewOfferLink } from '@/components/offer/view-offer-link';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { Card } from '@/components/ui/card';
import { IconArrowDownRight, IconClock } from '@/components/ui/icon';
import { formatDuration, formatStops } from '@/lib/domain/flight-format';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { airlineLogoUrl, flightLabel, localDepartureTime } from '@/lib/domain/offer';
import { offerPath } from '@/lib/domain/route-url';
import {
  promotionAgeLabel,
  promotionDiscountLabel,
  promotionReferenceLabel,
} from '@/lib/domain/promotion';
import styles from './promotion-card.module.css';

export interface PromotionCardProps {
  origin: string;
  originName: string;
  promotion: PromotionItem;
  /** Instante da renderização no servidor: a idade não muda na hidratação. */
  renderedAt: string;
  /** SPEC-016: destacado quando o marcador correspondente é selecionado no mapa. */
  selected?: boolean;
  /**
   * SPEC-038: página da oferta ligada (mesmo interruptor da página da rota, só
   * no servidor). Ligada: "Ver oferta"; desligada: compra direto, como antes.
   */
  offerPages?: boolean;
}

/**
 * SPEC-032: todo cartão mostra a base da comparação (mediana das datas
 * próximas e quantos preços) e a idade do preço. "Como calculamos?" abre o
 * texto pronto da API, conferível à mão contra o calendário da rota.
 */
export function PromotionCard({
  origin,
  originName,
  promotion,
  renderedAt,
  selected = false,
  offerPages = false,
}: PromotionCardProps) {
  const { price, reference } = promotion;
  const age = promotionAgeLabel(promotion.observedAt, new Date(renderedAt));
  const priceText = formatMoney(price);
  const tripLabel = promotion.returnDate
    ? `${formatDate(promotion.departureDate)} → ${formatDate(promotion.returnDate)}`
    : `Só ida · ${formatDate(promotion.departureDate)}`;

  return (
    <article
      className={styles.shell}
      aria-label={`Promoção ${originName} para ${promotion.destinationName}, ${priceText}`}
    >
      <Card padding="sm" className={`${styles.card} ${selected ? styles.selected : ''}`.trim()}>
        <div className={styles.top}>
          <span className={styles.badge}>
            <IconArrowDownRight size={14} />
            {promotionDiscountLabel(promotion.discountBps)}
          </span>
          <span className={`${styles.age} ${age.aging ? styles.aging : ''}`.trim()}>
            <IconClock size={14} /> {age.text}
          </span>
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <div className={styles.routeRow}>
              <RouteLine
                origin={origin}
                destination={promotion.destination}
                originName={originName}
                destinationName={promotion.destinationName}
              />
            </div>

            <div className={styles.meta}>
              <span>{tripLabel}</span>
              <span>{formatStops(promotion.stops)}</span>
              <span>1 adulto · econômica</span>
            </div>

            <div className={styles.priceBlock}>
              <p className={styles.priceLabel}>Menor preço observado pelo sistema para a data</p>
              <p className={`${styles.price} tabular-nums`}>{priceText}</p>
              <p className={styles.reference}>
                {promotionReferenceLabel({ ...reference, currency: price.currency })} nas outras
                datas próximas
              </p>
            </div>
          </div>

          <div className={styles.side}>
            {promotion.flight && <PromotionFlight flight={promotion.flight} />}
            <details className={styles.howTo}>
              <summary>Como calculamos?</summary>
              <p>{reference.explanation}</p>
              <p>
                Comparamos com as outras datas próximas desta rota, não com um histórico do preço. O
                preço vem de buscas recentes no site parceiro e pode mudar até a compra.
              </p>
            </details>
          </div>
        </div>

        <div className={styles.actions}>
          {offerPages && !promotion.returnDate ? (
            <ViewOfferLink
              href={offerPath(
                { code: origin, name: originName },
                { code: promotion.destination, name: promotion.destinationName },
                promotion.departureDate,
              )}
              context={`${originName} para ${promotion.destinationName} por ${priceText}`}
            />
          ) : promotion.purchaseUrl ? (
            <PurchaseButton
              href={promotion.purchaseUrl}
              status="CURRENT"
              label="Ver no site parceiro"
              context={`${originName} para ${promotion.destinationName} por ${priceText}`}
            />
          ) : (
            <span className={styles.purchaseUnavailable}>Link do parceiro indisponível</span>
          )}
        </div>
        {!(offerPages && !promotion.returnDate) && <PurchaseNote />}
      </Card>
    </article>
  );
}

/** SPEC-038: voo mais barato que a fonte viu no dia — companhia, voo, horário e aeroportos. */
function PromotionFlight({ flight }: { flight: RouteOfferFlight }) {
  const time = localDepartureTime(flight.departureAt);
  const duration = formatDuration(flight.durationMinutes);
  const facts = [
    time ? `Saída ${time}` : null,
    `${flight.originAirport} → ${flight.destinationAirport}`,
    duration,
  ].filter(Boolean);
  return (
    <div className={styles.flight}>
      <Image
        src={airlineLogoUrl(flight.carrierCode)}
        alt=""
        width={32}
        height={32}
        className={styles.logo}
      />
      <div>
        <p className={styles.carrier}>{flightLabel(flight)}</p>
        <p className={styles.flightFacts}>{facts.join(' · ')}</p>
        <p className={styles.flightNote}>Voo mais barato que encontramos neste dia</p>
      </div>
    </div>
  );
}
