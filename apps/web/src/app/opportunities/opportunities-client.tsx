'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { OpportunityItem } from '@/lib/api/types';
import { OpportunityCard } from './opportunity-card';
import styles from './page.module.css';

// SPEC-016: Leaflet toca `window`/`document` na importação — precisa de
// `ssr: false`, que só é permitido dentro de um Client Component no App
// Router (por isso o dynamic() está aqui, não em page.tsx, que é Server
// Component).
const OpportunityMap = dynamic(() => import('./opportunity-map'), {
  ssr: false,
  loading: () => <Skeleton height="22rem" />,
});

export interface OpportunitiesClientProps {
  opportunities: OpportunityItem[];
}

/**
 * SPEC-016 §"Regras de interação": "ao abrir mapa, preservar os filtros da
 * lista" (view é um query param a mais, não substitui os outros) e "ao
 * selecionar ponto no mapa, destacar o item correspondente na lista" —
 * `selectedId` é estado local, não outro query param (evitaria round-trip
 * de navegação a cada clique num marcador).
 */
export function OpportunitiesClient({ opportunities }: OpportunitiesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showMap = searchParams.get('view') === 'map';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function setView(view: 'list' | 'map'): void {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'map') {
      params.set('view', 'map');
    } else {
      params.delete('view');
    }
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }

  function handleSelect(searchTargetId: string): void {
    setSelectedId(searchTargetId);
    cardRefs.current[searchTargetId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <div className={styles.viewToggle} role="group" aria-label="Modo de exibição">
        <button
          type="button"
          className={!showMap ? styles.viewToggleActive : styles.viewToggleButton}
          aria-pressed={!showMap}
          onClick={() => setView('list')}
        >
          Lista
        </button>
        <button
          type="button"
          className={showMap ? styles.viewToggleActive : styles.viewToggleButton}
          aria-pressed={showMap}
          onClick={() => setView('map')}
        >
          Mapa
        </button>
      </div>

      {showMap && <OpportunityMap opportunities={opportunities} onSelect={handleSelect} />}

      <div className={styles.list}>
        {opportunities.map((opportunity) => (
          <div
            key={opportunity.searchTargetId}
            ref={(element) => {
              cardRefs.current[opportunity.searchTargetId] = element;
            }}
          >
            <OpportunityCard
              opportunity={opportunity}
              selected={opportunity.searchTargetId === selectedId}
            />
          </div>
        ))}
      </div>
    </>
  );
}
