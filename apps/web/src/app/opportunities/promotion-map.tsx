'use client';

import type { PromotionItem } from '@flight-watch/contracts';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { formatMoney } from '@/lib/domain/money';
import styles from './opportunity-map.module.css';

export interface PromotionMapProps {
  promotions: PromotionItem[];
  onSelect: (destination: string) => void;
}

// Mesmo ícone de ponto via CSS do mapa da SPEC-016 (ver opportunity-map.tsx).
const markerIcon = L.divIcon({ className: styles.marker, iconSize: [16, 16] });
const BRAZIL_CENTER: [number, number] = [-14, -51];

/**
 * SPEC-032: destinos do feed a partir da origem escolhida — uma promoção por
 * destino. Aditivo e `aria-hidden`, como o mapa da SPEC-016: a lista é a via
 * completa. Destino sem coordenada fica só na lista.
 */
export default function PromotionMap({ promotions, onSelect }: PromotionMapProps) {
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
        {promotions.map((promotion) => {
          const coordinates = promotion.destinationCoordinates;
          if (!coordinates) return null;
          return (
            <Marker
              key={promotion.destination}
              position={[coordinates.latitude, coordinates.longitude]}
              icon={markerIcon}
              eventHandlers={{ click: () => onSelect(promotion.destination) }}
            >
              <Popup>
                <strong>
                  {promotion.destinationName} ({promotion.destination})
                </strong>
                <br />
                {formatMoney(promotion.price)}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
