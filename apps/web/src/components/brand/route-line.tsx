import styles from './route-line.module.css';

export interface RouteLineProps {
  origin: string;
  destination: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Nome da cidade embaixo do código (SPEC-029: vem da API, do catálogo).
   * Ausente ou null mostra só o código.
   */
  originName?: string | null | undefined;
  destinationName?: string | null | undefined;
  /** Desenha o arco ao montar (detalhe do monitoramento, hero). */
  animated?: boolean;
  /** Texto/traço claros para uso sobre fundo petróleo — mesmo padrão de `Logo`. */
  inverse?: boolean;
}

/**
 * CP-03: motivo gráfico da marca aplicado a uma rota real — origem (ponto
 * neutro) → arco tracejado → destino (ponto laranja, igual ao símbolo da
 * marca). Toda rota na interface usa este componente. Texto acessível
 * "GRU para MIA"; o arco é decorativo. O nome da cidade vem pronto da API
 * (SPEC-029) — nenhuma lista de aeroportos no web.
 */
export function RouteLine({
  origin,
  destination,
  size = 'md',
  originName,
  destinationName,
  animated = false,
  inverse = false,
}: RouteLineProps) {
  const originCity = originName ?? null;
  const destinationCity = destinationName ?? null;

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
