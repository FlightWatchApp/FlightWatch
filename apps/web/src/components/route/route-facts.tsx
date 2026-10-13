import type { GetRouteFactsResponse } from '@flight-watch/contracts';
import { formatDistanceKm, formatEstimatedDuration } from '@/lib/domain/route-page';
import styles from './route-page.module.css';

export type RouteFactsProps = GetRouteFactsResponse;

/**
 * SPEC-033 "Sobre a rota": cada fato diz de onde vem (calculada, estimado) e a
 * linha some quando não há dado — nunca companhia nem valor inventado.
 */
export function RouteFacts({
  origin,
  destination,
  distanceKm,
  estimatedDirectFlightMinutes,
}: RouteFactsProps) {
  return (
    <section className={styles.facts} aria-labelledby="route-facts">
      <h2 id="route-facts" className={styles.sectionTitle}>
        Sobre a rota
      </h2>
      <dl>
        {distanceKm !== null && (
          <div>
            <dt>Distância</dt>
            <dd>{formatDistanceKm(distanceKm)} (calculada entre as cidades)</dd>
          </div>
        )}
        {estimatedDirectFlightMinutes !== null && (
          <div>
            <dt>Tempo de voo direto</dt>
            <dd>{formatEstimatedDuration(estimatedDirectFlightMinutes)}</dd>
          </div>
        )}
        {[origin, destination].map((place) =>
          place.airports.length > 0 ? (
            <div key={place.code}>
              <dt>Aeroportos de {place.name}</dt>
              <dd>
                {place.airports.map((airport) => `${airport.name} (${airport.code})`).join(', ')}
              </dd>
            </div>
          ) : null,
        )}
      </dl>
      <p className={styles.factsNote}>
        Distância e tempo são calculados a partir da posição das cidades; a duração de cada voo
        depende da companhia e das escalas.
      </p>
    </section>
  );
}
