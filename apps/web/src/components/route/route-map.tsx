'use client';

import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { greatCirclePath, type LatLng } from '@/lib/domain/route-map';
import styles from './route-map.module.css';

export interface RouteMapPoint extends LatLng {
  code: string;
  name: string;
}

export interface RouteMapProps {
  origin: RouteMapPoint;
  destination: RouteMapPoint;
}

const originIcon = L.divIcon({ className: styles.markerOrigin, iconSize: [14, 14] });
const destinationIcon = L.divIcon({ className: styles.markerDestination, iconSize: [16, 16] });

/**
 * SPEC-033: a rota no mapa — origem, destino e o arco de grande círculo, com
 * os nomes fixos ao lado dos pontos. Decorativo (`aria-hidden`): a página diz
 * o mesmo em texto. Tiles do OpenStreetMap com a atribuição visível.
 */
export default function RouteMap({ origin, destination }: RouteMapProps) {
  const path = greatCirclePath(origin, destination, 64);
  const bounds = L.latLngBounds(path.map(([lat, lng]) => [lat, lng] as [number, number]));

  return (
    <div className={styles.wrapper} aria-hidden="true">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [36, 36] }}
        scrollWheelZoom={false}
        className={styles.map ?? ''}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={path} pathOptions={{ className: styles.arc ?? '' }} />
        {[
          { point: origin, icon: originIcon },
          { point: destination, icon: destinationIcon },
        ].map(({ point, icon }) => (
          <Marker key={point.code} position={[point.latitude, point.longitude]} icon={icon}>
            <Tooltip permanent direction="top" offset={[0, -8]} className={styles.label ?? ''}>
              {point.name} ({point.code})
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
