import Image from 'next/image';
import type { RouteOfferFlight } from '@flight-watch/contracts';
import { formatDuration, formatStops } from '@/lib/domain/flight-format';
import { airlineLogoUrl, flightLabel, localDepartureTime } from '@/lib/domain/offer';
import styles from './flight-summary.module.css';

/**
 * SPEC-038: o voo mais barato que a fonte viu no dia, em superfície clara
 * (página do monitoramento). Dito como "o mais barato que encontramos", nunca
 * como o voo do preço observado.
 */
export function FlightSummary({ flight }: { flight: RouteOfferFlight }) {
  const time = localDepartureTime(flight.departureAt);
  const duration = formatDuration(flight.durationMinutes);
  return (
    <section className={styles.summary} aria-label="Voo mais barato encontrado neste dia">
      <div className={styles.carrier}>
        <Image
          src={airlineLogoUrl(flight.carrierCode)}
          alt=""
          width={36}
          height={36}
          className={styles.logo}
        />
        <div>
          <p className={styles.name}>{flightLabel(flight)}</p>
          <p className={styles.note}>Voo mais barato que encontramos neste dia</p>
        </div>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Saída</dt>
          <dd>{time ?? '—'}</dd>
        </div>
        <div>
          <dt>Aeroportos</dt>
          <dd>
            {flight.originAirport} → {flight.destinationAirport}
          </dd>
        </div>
        <div>
          <dt>Duração</dt>
          <dd>{duration ?? '—'}</dd>
        </div>
        <div>
          <dt>Escalas</dt>
          <dd>{formatStops(flight.stops)}</dd>
        </div>
      </dl>
    </section>
  );
}
