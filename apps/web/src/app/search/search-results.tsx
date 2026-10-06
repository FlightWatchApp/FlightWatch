import Link from 'next/link';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSearch } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import type { FlightSearchResult } from '@/lib/api/types';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney } from '@/lib/domain/money';
import { OfferCard } from './[id]/offer-card';
import styles from './search-results.module.css';

export interface SearchResultsProps {
  search: FlightSearchResult;
  embedded?: boolean;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, '0')}`;
}

export function SearchResults({ search, embedded = false }: SearchResultsProps) {
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
  const fastest =
    search.offers.length > 0
      ? search.offers.reduce((min, offer) =>
          offer.durationMinutes < min.durationMinutes ? offer : min,
        )
      : null;
  const resultCount = `${search.offers.length} ${search.offers.length === 1 ? 'oferta' : 'ofertas'}`;

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
        <span className={styles.liveMark}>Preço observado agora</span>
      </header>

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
            <strong>{fastest ? formatDuration(fastest.durationMinutes) : '—'}</strong>
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
          title="Nenhuma oferta encontrada"
          description="Não encontramos passagens para essa combinação de rota, data e filtros."
        />
      )}

      {search.offers.length > 0 && (
        <div className={styles.offers}>
          {search.offers.some((offer) => offer.availabilityStatus === 'EXPIRED') && (
            <InlineAlert tone="warning">
              Algumas ofertas abaixo já expiraram — o preço é só referência, não confirmado no
              fornecedor.
            </InlineAlert>
          )}
          {search.offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} cheapest={offer.id === cheapest?.id} />
          ))}
          {search.offers.some((offer) => offer.purchaseUrl) && <PurchaseNote />}
        </div>
      )}
    </section>
  );
}
