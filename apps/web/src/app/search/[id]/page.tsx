import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSearch } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { ApiError } from '@/lib/api/client';
import { getFlightSearch } from '@/lib/api/searches';
import { formatDate } from '@/lib/domain/freshness';
import { OfferCard } from './offer-card';
import styles from './page.module.css';

export default async function SearchResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let search;
  try {
    search = await getFlightSearch(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const tripLabel =
    search.tripType === 'ROUND_TRIP' && search.returnDate
      ? `${formatDate(search.departureDate)} → ${formatDate(search.returnDate)}`
      : `Só ida · ${formatDate(search.departureDate)}`;

  return (
    <div className={`container ${styles.page}`}>
      <Link href="/search" className={styles.back}>
        ← Nova busca
      </Link>

      <div>
        <h1>
          {search.origin} → {search.destination}
        </h1>
        <p className={styles.subtitle}>{tripLabel}</p>
      </div>

      {/* SPEC-014 §"Decisão de design": falha do provider não é HTTP 4xx/5xx —
          o recurso foi criado, mas a busca em si não teve sucesso. Rotulado
          como falha temporária, nunca como "nenhuma passagem existe". */}
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
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}
