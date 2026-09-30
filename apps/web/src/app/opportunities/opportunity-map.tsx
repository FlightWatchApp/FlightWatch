'use client';

import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { AIRPORT_COORDINATES } from '@/lib/domain/airport-coordinates';
import { formatMoney } from '@/lib/domain/money';
import type { OpportunityItem } from '@/lib/api/types';
import styles from './opportunity-map.module.css';

export interface OpportunityMapProps {
  opportunities: OpportunityItem[];
  onSelect: (searchTargetId: string) => void;
}

// Ícone próprio (um ponto simples via CSS) em vez do ícone default do
// Leaflet — o ícone default referencia arquivos de imagem por caminho
// relativo que não resolve sob bundlers (Webpack/Turbopack), um problema
// conhecido de react-leaflet + Next.js. Evita a dependência de asset por
// completo, mais simples que reconfigurar `L.Icon.Default`.
const markerIcon = L.divIcon({
  className: styles.marker,
  iconSize: [16, 16],
});

const BRAZIL_CENTER: [number, number] = [-14, -51];

/**
 * SPEC-016 §"Acessibilidade": a lista (renderizada pelo componente pai) é a
 * via primária e completa — funciona sem mapa/JS. O mapa é aditivo,
 * mouse-only, marcado `aria-hidden` de propósito: navegar cada marcador do
 * Leaflet por teclado seria engenharia significativa e de alto risco de
 * ficar mal feito; "o mapa nunca deve exigir que o usuário decifre uma
 * visualização para encontrar o botão de compra" (UX doc). Um marcador por
 * destino distinto (não por oportunidade individual) — várias oportunidades
 * podem compartilhar destino.
 */
export default function OpportunityMap({ opportunities, onSelect }: OpportunityMapProps) {
  const byDestination = new Map<string, OpportunityItem[]>();
  for (const opportunity of opportunities) {
    if (!AIRPORT_COORDINATES[opportunity.destination]) {
      continue;
    }
    const existing = byDestination.get(opportunity.destination) ?? [];
    existing.push(opportunity);
    byDestination.set(opportunity.destination, existing);
  }

  return (
    <div className={styles.mapWrapper} aria-hidden="true">
      <MapContainer
        center={BRAZIL_CENTER}
        zoom={3}
        scrollWheelZoom={false}
        className={styles.map ?? ''}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {[...byDestination.entries()].map(([code, items]) => {
          const coordinate = AIRPORT_COORDINATES[code];
          if (!coordinate) return null;
          const cheapest = items.reduce((min, item) =>
            item.offer.amountMinor < min.offer.amountMinor ? item : min,
          );
          return (
            <Marker
              key={code}
              position={[coordinate.lat, coordinate.lng]}
              icon={markerIcon}
              eventHandlers={{ click: () => onSelect(cheapest.searchTargetId) }}
            >
              <Popup>
                <strong>{coordinate.label}</strong>
                <br />A partir de{' '}
                {formatMoney({
                  amountMinor: cheapest.offer.amountMinor,
                  currency: cheapest.offer.currency,
                })}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
