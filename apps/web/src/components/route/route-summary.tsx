import type { GetRouteFactsResponse } from '@flight-watch/contracts';
import { RouteMapLoader } from './route-map-loader';
import styles from './route-page.module.css';

export type RouteSummaryProps = Pick<GetRouteFactsResponse, 'origin' | 'destination'>;

/**
 * SPEC-033: cabeçalho de rota compartilhado — os dois lugares (nome, país,
 * aeroportos) e o mapa. Usado pela página pública da rota e pelo
 * monitoramento, que muda só o que vem abaixo (preços por data × histórico).
 */
export function RouteSummary({ origin, destination }: RouteSummaryProps) {
  return (
    <div className={styles.top}>
      <section className={styles.places} aria-label="Rota">
        {[origin, destination].map((place, index) => (
          <div key={place.code} className={styles.place}>
            <p className={styles.placeRole}>{index === 0 ? 'Saindo de' : 'Chegando em'}</p>
            <p className={styles.placeName}>
              {place.name} <span className="iata">{place.code}</span>
            </p>
            <p className={styles.placeMeta}>{place.countryName}</p>
            {place.airports.length > 0 && (
              <p className={styles.placeMeta}>
                Aeroportos: {place.airports.map((airport) => airport.code).join(' · ')}
              </p>
            )}
          </div>
        ))}
      </section>
      {origin.coordinates && destination.coordinates && (
        <RouteMapLoader
          origin={{ ...origin.coordinates, code: origin.code, name: origin.name }}
          destination={{
            ...destination.coordinates,
            code: destination.code,
            name: destination.name,
          }}
        />
      )}
    </div>
  );
}
