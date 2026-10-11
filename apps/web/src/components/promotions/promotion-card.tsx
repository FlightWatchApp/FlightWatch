import type { PromotionItem } from '@flight-watch/contracts';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { Card } from '@/components/ui/card';
import { IconArrowDownRight, IconClock } from '@/components/ui/icon';
import { formatStops } from '@/lib/domain/flight-format';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
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
}: PromotionCardProps) {
  const { price, reference } = promotion;
  const age = promotionAgeLabel(promotion.observedAt, new Date(renderedAt));
  const priceText = formatMoney(price);
  const tripLabel = promotion.returnDate
    ? `${formatDate(promotion.departureDate)} → ${formatDate(promotion.returnDate)}`
    : `Só ida · ${formatDate(promotion.departureDate)}`;

  return (
    <article aria-label={`Promoção ${originName} para ${promotion.destinationName}, ${priceText}`}>
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
            {promotionReferenceLabel({ ...reference, currency: price.currency })} nas outras datas
            próximas
          </p>
        </div>

        <details className={styles.howTo}>
          <summary>Como calculamos?</summary>
          <p>{reference.explanation}</p>
          <p>
            Comparamos com as outras datas próximas desta rota, não com um histórico do preço. O
            preço vem de buscas recentes no site parceiro e pode mudar até a compra.
          </p>
        </details>

        <div className={styles.actions}>
          {promotion.purchaseUrl ? (
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
        <PurchaseNote />
      </Card>
    </article>
  );
}
