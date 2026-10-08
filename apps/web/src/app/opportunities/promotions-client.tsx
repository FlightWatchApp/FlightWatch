'use client';

import type { PromotionItem } from '@flight-watch/contracts';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { PromotionCard } from '@/components/promotions/promotion-card';
import { Skeleton } from '@/components/ui/skeleton';
import styles from './page.module.css';

// Leaflet toca `window` na importação: `ssr: false` só dentro de Client Component.
const PromotionMap = dynamic(() => import('./promotion-map'), {
  ssr: false,
  loading: () => <Skeleton height="22rem" />,
});

export interface PromotionsClientProps {
  origin: string;
  originName: string;
  promotions: PromotionItem[];
  renderedAt: string;
}

/** SPEC-032 + SPEC-016: lista e mapa dos destinos; marcador destaca o cartão. */
export function PromotionsClient({
  origin,
  originName,
  promotions,
  renderedAt,
}: PromotionsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showMap = searchParams.get('view') === 'map';
  const [selected, setSelected] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function setView(view: 'list' | 'map'): void {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'map') params.set('view', 'map');
    else params.delete('view');
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }

  function handleSelect(destination: string): void {
    setSelected(destination);
    cardRefs.current[destination]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

      {showMap && (
        <div className="reveal">
          <PromotionMap promotions={promotions} onSelect={handleSelect} />
        </div>
      )}

      <div className={styles.list}>
        {promotions.map((promotion) => (
          <div
            key={promotion.destination}
            ref={(element) => {
              cardRefs.current[promotion.destination] = element;
            }}
          >
            <PromotionCard
              origin={origin}
              originName={originName}
              promotion={promotion}
              renderedAt={renderedAt}
              selected={promotion.destination === selected}
            />
          </div>
        ))}
      </div>
    </>
  );
}
