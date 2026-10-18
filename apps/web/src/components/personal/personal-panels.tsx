import Link from 'next/link';
import type {
  MeOverviewResponse,
  PromotionHighlight,
  WatchListItem,
} from '@flight-watch/contracts';
import { ViewOfferLink } from '@/components/offer/view-offer-link';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import buttonStyles from '@/components/ui/button.module.css';
import { IconSearch } from '@/components/ui/icon';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { quotaLabel } from '@/lib/domain/watch-quota';
import { promotionDiscountLabel } from '@/lib/domain/promotion';
import { offerPath } from '@/lib/domain/route-url';
import { isBelowTypicalPrice } from '@/lib/domain/watch-price';
import styles from './personal-panels.module.css';

export interface PersonalPanelsProps {
  overview: MeOverviewResponse;
  /** SPEC-038: página da oferta ligada (decidido no servidor). */
  offerPages: boolean;
  /** `aside`: coluna da página da oferta; `grid`: seção da home logada. */
  layout: 'aside' | 'grid';
}

/**
 * SPEC-040 — o que o sistema sabe da pessoa. Cada painel só aparece com dado
 * (tabela "Estados" da spec); "Buscar nova passagem" aparece sempre. Nenhum
 * número de compra ou economia realizada.
 */
export function PersonalPanels({ overview, offerPages, layout }: PersonalPanelsProps) {
  const hasWatches = overview.watchCount > 0;
  return (
    <div className={layout === 'aside' ? styles.aside : styles.grid}>
      {hasWatches && <ActiveWatchesPanel overview={overview} />}
      {hasWatches && <SummaryPanel overview={overview} />}
      {overview.destinationPromotions.length > 0 && (
        <DestinationPromotionsPanel
          promotions={overview.destinationPromotions}
          offerPages={offerPages}
        />
      )}
      <SearchPanel homeCity={overview.homeCity} />
    </div>
  );
}

function watchState(watch: WatchListItem): { label: string; tone: 'good' | 'muted' | 'normal' } {
  if (watch.status === 'PAUSED') return { label: 'Pausado', tone: 'muted' };
  if (isBelowTypicalPrice(watch)) return { label: 'Bem abaixo do normal', tone: 'good' };
  return { label: 'Observando', tone: 'normal' };
}

function ActiveWatchesPanel({ overview }: { overview: MeOverviewResponse }) {
  return (
    <section className={styles.panel} aria-labelledby="panel-watches">
      <h2 id="panel-watches" className={styles.title}>
        Monitoramentos ativos
      </h2>
      <ul className={styles.list}>
        {overview.activeWatches.map((watch) => {
          const state = watchState(watch);
          const typical = watch.lowPrice?.typicalAmountMinor ?? null;
          return (
            <li key={watch.id}>
              <Link href={`/watches/${watch.id}`} prefetch={false} className={styles.watch}>
                <span className={styles.route}>
                  {watch.origin} → {watch.destination}
                </span>
                <span className={styles.watchPrices}>
                  <strong className="tabular-nums">
                    {watch.currentPrice ? formatMoney(watch.currentPrice) : 'Aguardando preço'}
                  </strong>
                  {typical !== null && (
                    <span className={styles.muted}>
                      normal {formatMoney({ amountMinor: typical, currency: watch.currency })}
                    </span>
                  )}
                </span>
                <span className={`${styles.state} ${styles[state.tone]}`}>
                  <span className={styles.dot} aria-hidden="true" />
                  {state.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {overview.watchCount > overview.activeWatches.length && (
        <Link href="/watches" className={styles.more}>
          Ver todos ({overview.watchCount}) →
        </Link>
      )}
      {quotaLabel(overview.watchQuota) && (
        <p className={styles.quota}>Criados {quotaLabel(overview.watchQuota)}.</p>
      )}
    </section>
  );
}

function SummaryPanel({ overview }: { overview: MeOverviewResponse }) {
  const drop = overview.biggestDrop;
  const stats = [
    { value: overview.activeCount, label: 'Monitoramentos ativos', tone: styles.statInfo },
    { value: overview.alertsSent, label: 'Alertas enviados', tone: styles.statInfo },
    { value: overview.belowTypicalNow, label: 'Abaixo do normal agora', tone: styles.statGood },
  ].filter((stat) => stat.value > 0);
  if (stats.length === 0 && !drop) return null;
  return (
    <section className={styles.panel} aria-labelledby="panel-summary">
      <h2 id="panel-summary" className={styles.title}>
        Seu resumo
      </h2>
      <dl className={styles.stats}>
        {drop && (
          <div className={`${styles.stat} ${styles.statGood}`}>
            <dd className="tabular-nums">
              {formatMoney({ amountMinor: drop.amountMinor, currency: drop.currency })}
            </dd>
            <dt>
              Maior queda que avisamos: {drop.percent}% abaixo do normal em {drop.origin.name} →{' '}
              {drop.destination.name}, {formatDate(drop.departureDate)}
            </dt>
          </div>
        )}
        {stats.map((stat) => (
          <div key={stat.label} className={`${styles.stat} ${stat.tone}`}>
            <dd className="tabular-nums">{stat.value}</dd>
            <dt>{stat.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DestinationPromotionsPanel({
  promotions,
  offerPages,
}: {
  promotions: PromotionHighlight[];
  offerPages: boolean;
}) {
  return (
    <section className={styles.panel} aria-labelledby="panel-destinations">
      <h2 id="panel-destinations" className={styles.title}>
        Promoções para os seus destinos
      </h2>
      <ul className={styles.list}>
        {promotions.map((promotion) => {
          const price = formatMoney(promotion.price);
          const context = `${promotion.originName} para ${promotion.destinationName} por ${price}`;
          return (
            <li key={`${promotion.origin}-${promotion.destination}`} className={styles.promotion}>
              <span className={styles.badge}>{promotionDiscountLabel(promotion.discountBps)}</span>
              <span className={styles.route}>
                {promotion.origin} → {promotion.destination}
              </span>
              <span className={styles.muted}>
                {promotion.originName} → {promotion.destinationName} · só ida ·{' '}
                {formatDate(promotion.departureDate)}
              </span>
              <strong className={`${styles.promotionPrice} tabular-nums`}>{price}</strong>
              {offerPages && !promotion.returnDate ? (
                <ViewOfferLink
                  href={offerPath(
                    { code: promotion.origin, name: promotion.originName },
                    { code: promotion.destination, name: promotion.destinationName },
                    promotion.departureDate,
                  )}
                  size="sm"
                  context={context}
                />
              ) : (
                promotion.purchaseUrl && (
                  <PurchaseButton
                    href={promotion.purchaseUrl}
                    status="CURRENT"
                    size="sm"
                    label="Ver no site parceiro"
                    context={context}
                  />
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SearchPanel({ homeCity }: { homeCity: MeOverviewResponse['homeCity'] }) {
  const classes = [buttonStyles.button, buttonStyles.primary, buttonStyles.md, styles.searchButton]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={`${styles.panel} ${styles.searchPanel}`} aria-labelledby="panel-search">
      <h2 id="panel-search" className={styles.title}>
        Buscar nova passagem
      </h2>
      <p className={styles.muted}>
        {homeCity
          ? `Começar a monitorar uma rota saindo de ${homeCity.name}.`
          : 'Começar a monitorar uma rota.'}
      </p>
      <Link href="/search" className={classes}>
        <IconSearch size={16} />
        Buscar passagem
      </Link>
    </section>
  );
}
