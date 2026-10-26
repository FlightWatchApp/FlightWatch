import Link from 'next/link';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSearch } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PriceCalendar } from '@/components/search/price-calendar';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import buttonStyles from '@/components/ui/button.module.css';
import type { FlightSearchResult } from '@/lib/api/types';
import type { CalendarDayInput } from '@/lib/domain/price-calendar';
import { formatDuration } from '@/lib/domain/flight-format';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { allFlightsLabel } from '@/lib/domain/purchase-partner-name';
import { describePriceContext } from '@/lib/domain/price-context';
import { buildWatchPrefillHref } from '@/lib/domain/trip-prefill';
import { OfferCard } from './[id]/offer-card';
import styles from './search-results.module.css';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import { offerPath } from '@/lib/domain/route-url';

export interface SearchResultsProps {
  search: FlightSearchResult;
  embedded?: boolean;
  /** SPEC-031: calendário do mês da busca; null quando a fonte não respondeu. */
  calendar?: { month: string; days: CalendarDayInput[] } | null;
}

export function SearchResults({ search, embedded = false, calendar = null }: SearchResultsProps) {
  // SPEC-038: busca só de ida leva à página da oferta da mesma data (mesma fonte e cache).
  const offerHref =
    routePagesEnabled() && search.tripType === 'ONE_WAY'
      ? offerPath(
          { code: search.origin, name: search.originName ?? '' },
          { code: search.destination, name: search.destinationName ?? '' },
          search.departureDate,
        )
      : null;
  const tripLabel =
    search.tripType === 'ROUND_TRIP' && search.returnDate
      ? `${formatDate(search.departureDate)} → ${formatDate(search.returnDate)}`
      : `Só ida · ${formatDate(search.departureDate)}`;
  const cheapest =
    search.offers.length > 0
      ? search.offers.reduce((min, offer) =>
          offer.totalAmountMinor < min.totalAmountMinor ? offer : min,
        )
      : null;
  // SPEC-030: resumo de tarifa pode não ter duração; só entra quem tem.
  const fastestMinutes = search.offers.reduce<number | null>(
    (min, offer) =>
      offer.durationMinutes !== null && (min === null || offer.durationMinutes < min)
        ? offer.durationMinutes
        : min,
    null,
  );
  const resultCount = `${search.offers.length} ${search.offers.length === 1 ? 'oferta' : 'ofertas'}`;
  // SPEC-045: onde o menor preço se situa entre os preços observados no mês da busca.
  const priceContext =
    cheapest && calendar ? describePriceContext(cheapest.totalAmountMinor, calendar.days) : null;
  // SPEC-045: monitorar vale para qualquer viagem pesquisada, com ou sem preço.
  const monitorHref = buildWatchPrefillHref({
    origin: search.origin,
    destination: search.destination,
    tripType: search.tripType,
    departureDate: search.departureDate,
    returnDate: search.returnDate,
  });

  return (
    <section
      id={embedded ? 'search-results' : undefined}
      className={`${styles.results} ${embedded ? styles.embedded : ''}`}
      aria-labelledby="search-results-title"
    >
      {!embedded && (
        <Link href="/search" className={styles.back}>
          ← Nova busca
        </Link>
      )}

      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Resultado da busca</p>
          <h2 id="search-results-title">
            <RouteLine
              origin={search.origin}
              destination={search.destination}
              originName={search.originName}
              destinationName={search.destinationName}
              size="lg"
            />
          </h2>
          <p className={styles.subtitle}>
            {tripLabel} · {resultCount}
          </p>
        </div>
        <span className={styles.liveMark}>Preços encontrados recentemente</span>
      </header>

      {/* SPEC-031: todos os voos (companhias e horários) no site parceiro —
          presente mesmo sem oferta, quando a pessoa mais precisa dele. */}
      {search.allFlightsUrl && (
        <div className={styles.allFlights}>
          <PurchaseButton
            href={search.allFlightsUrl}
            status="CURRENT"
            label={allFlightsLabel(search.allFlightsUrl)}
            context={`${search.originName ?? search.origin} para ${search.destinationName ?? search.destination}`}
          />
          <PurchaseNote />
        </div>
      )}

      {calendar && calendar.days.length > 0 && (
        <PriceCalendar search={search} month={calendar.month} days={calendar.days} />
      )}

      {cheapest && priceContext && (
        <p className={styles.priceContext}>{priceContextText(priceContext, cheapest.currency)}</p>
      )}

      {search.offers.length > 0 && (
        <div className={styles.summaryRail} aria-label="Resumo das ofertas">
          <div>
            <span>Ofertas encontradas</span>
            <strong>{search.offers.length}</strong>
          </div>
          <div className={styles.summaryActive}>
            <span>Melhor opção</span>
            <strong>
              {cheapest
                ? formatMoney({
                    amountMinor: cheapest.totalAmountMinor,
                    currency: cheapest.currency,
                  })
                : '—'}
            </strong>
          </div>
          <div>
            <span>Menor preço</span>
            <strong>
              {cheapest
                ? formatMoney({
                    amountMinor: cheapest.totalAmountMinor,
                    currency: cheapest.currency,
                  })
                : '—'}
            </strong>
          </div>
          <div>
            <span>Mais rápido</span>
            <strong>{formatDuration(fastestMinutes) ?? '—'}</strong>
          </div>
        </div>
      )}

      {search.status === 'FAILED' && (
        <InlineAlert tone="danger">
          Não conseguimos consultar o fornecedor agora. Isso não significa que não existam passagens
          — tente buscar de novo em instantes.
        </InlineAlert>
      )}

      {search.status !== 'FAILED' && search.offers.length === 0 && (
        <EmptyState
          icon={<IconSearch size={32} />}
          title="Ainda não temos preço para esse dia"
          description="Isso não quer dizer que não haja voos. Escolha outro dia no calendário ou veja todos os voos no site parceiro."
        />
      )}

      <aside className={styles.monitorCta} aria-labelledby="monitor-trip-title">
        <div>
          <h3 id="monitor-trip-title">Monitorar esta viagem</h3>
          <p>
            {search.offers.length > 0
              ? 'Avisamos por e-mail quando observarmos um preço bem abaixo do normal para esta viagem.'
              : 'Mesmo sem preço hoje, você pode monitorar: avisamos quando aparecer um preço bom. Rotas pouco procuradas têm poucos preços na nossa fonte, e o aviso pode demorar ou não chegar.'}
          </p>
        </div>
        <Link
          href={monitorHref}
          className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}
        >
          Monitorar esta viagem
        </Link>
      </aside>

      {search.offers.length > 0 && (
        <div className={styles.offers}>
          {search.offers.some((offer) => offer.availabilityStatus === 'EXPIRED') && (
            <InlineAlert tone="warning">
              Algumas ofertas abaixo já expiraram — o preço é só referência, não confirmado no
              fornecedor.
            </InlineAlert>
          )}
          {search.offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              cheapest={offer.id === cheapest?.id}
              offerHref={offerHref}
            />
          ))}
          {!offerHref && search.offers.some((offer) => offer.purchaseUrl) && <PurchaseNote />}
        </div>
      )}
    </section>
  );
}

/** SPEC-045: frase de contexto, sempre "do que o sistema observou", nunca "do mercado". */
function priceContextText(
  context: NonNullable<ReturnType<typeof describePriceContext>>,
  currency: string,
): string {
  const median = formatMoney({ amountMinor: context.medianMinor, currency });
  const base = `mediana dos ${context.sampleSize} preços que observamos neste mês: ${median}`;
  if (context.kind === 'below') return `Este preço está ${context.percent}% abaixo da ${base}.`;
  if (context.kind === 'above') return `Este preço está ${context.percent}% acima da ${base}.`;
  return `Este preço está em linha com a ${base}.`;
}
