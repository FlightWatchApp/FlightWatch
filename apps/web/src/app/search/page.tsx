import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { ApiError } from '@/lib/api/client';
import { getFlightSearch } from '@/lib/api/searches';
import { SearchForm } from './search-form';
import { SearchResults } from './search-results';
import styles from './page.module.css';

/**
 * SPEC-014/PG-04: busca pública — ao contrário de `watches/new`, esta
 * página não checa sessão nem redireciona. Autenticação só é exigida mais
 * adiante, ao tentar "Monitorar" uma oferta.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ searchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawSearchId = params.searchId;
  const searchId = Array.isArray(rawSearchId) ? rawSearchId[0] : rawSearchId;
  let search = null;

  if (searchId) {
    try {
      search = await getFlightSearch(searchId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.band}>
        <div className={`container ${styles.bandInner} reveal`}>
          <p className={styles.eyebrow}>Buscar passagens</p>
          <h1 className={styles.title}>Para onde você quer ir?</h1>
          <p className={styles.subtitle}>
            Veja as opções disponíveis agora e compre no site parceiro. Não precisa de conta para
            buscar; só para monitorar um preço.
          </p>
        </div>
      </section>
      <div className={`container ${styles.formWrap}`}>
        <div className={`${styles.searchShell} ${search ? styles.withResults : ''}`}>
          <div
            className={`${styles.formCard} reveal`}
            style={{ '--reveal-delay': '100ms' } as CSSProperties}
          >
            <SearchForm />
          </div>
          {search && <SearchResults search={search} embedded />}
        </div>
        <PurchaseNote align="center" />
      </div>
    </div>
  );
}
