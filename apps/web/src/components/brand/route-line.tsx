import { airportCity } from '@/lib/domain/airport-coordinates';
import styles from './route-line.module.css';

export interface RouteLineProps {
  origin: string;
  destination: string;
  size?: 'sm' | 'md' | 'lg';
  /** Mostra a cidade embaixo do código IATA quando o aeroporto é conhecido. */
  showCities?: boolean;
  /** Desenha o arco ao montar (detalhe do monitoramento, hero). */
  animated?: boolean;
  /** Texto/traço claros para uso sobre fundo petróleo — mesmo padrão de `Logo`. */
  inverse?: boolean;
}

/**
 * CP-03: motivo gráfico da marca aplicado a uma rota real — origem (ponto
 * neutro) → arco tracejado → destino (ponto laranja, igual ao símbolo da
 * marca). Toda rota na interface usa este componente. Texto acessível
 * "GRU para MIA"; o arco é decorativo. Cidade e rótulo vêm de
 * `lib/domain/airport-coordinates.ts` — único lugar com essa lógica.
 */
export function RouteLine({
  origin,
  destination,
  size = 'md',
  showCities = false,
  animated = false,
  inverse = false,
}: RouteLineProps) {
  const originCity = showCities ? airportCity(origin) : null;
  const destinationCity = showCities ? airportCity(destination) : null;

  return (
    <span
      className={`${styles.route} ${styles[size]} ${animated ? styles.animated : ''} ${inverse ? styles.inverse : ''}`}
    >
      <span className={styles.end}>
        <span className="iata">{origin}</span>
        {originCity && <span className={styles.city}>{originCity}</span>}
      </span>
      <span className="visually-hidden"> para </span>
      <svg
        className={styles.arc}
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <circle cx="4" cy="18" r="3" className={styles.dotOrigin} />
        <path d="M8 18 Q 50 -4 92 18" pathLength={1} className={styles.path} />
        <circle cx="96" cy="18" r="3" className={styles.dotDestination} />
      </svg>
      <span className={`${styles.end} ${styles.endRight}`}>
        <span className="iata">{destination}</span>
        {destinationCity && <span className={styles.city}>{destinationCity}</span>}
      </span>
    </span>
  );
}
