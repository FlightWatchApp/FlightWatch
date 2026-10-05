import styles from './brand-symbol.module.css';

export interface BrandSymbolProps {
  size?: number;
  /** Desenha a rota e revela a lente ao montar, uma vez (MO-03). */
  animated?: boolean;
  /** `tile`: bloco petróleo (padrão, favicon/avatar). `plain`: só o traço em `currentColor`. */
  variant?: 'tile' | 'plain';
  className?: string;
}

/**
 * Símbolo da marca (docs/BRAND.md §Símbolo, BR-02): uma rota que decola da
 * origem e pousa no destino, sempre laranja; a lente de observação de preço
 * fica sobre a subida. Mesma geometria de `public/brand/symbol.svg` — arco
 * `M12 47 C14 17 43 11 52 45` dividido na folga da lente (25,33; 23,09),
 * lente raio 6,8, pontos raio 4,4, traço 3,4, conjunto deslocado 2,5 para
 * baixo. Decorativo: o nome acessível vem do texto "Flight Watch" ao lado
 * (ver `Logo`), nunca deste componente sozinho.
 */
export function BrandSymbol({
  size = 32,
  animated = false,
  variant = 'tile',
  className,
}: BrandSymbolProps) {
  const classes = [
    styles.symbol,
    variant === 'plain' ? styles.plain : '',
    animated ? styles.animated : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={classes}
    >
      {variant === 'tile' && <rect width="64" height="64" rx="16" className={styles.tile} />}
      <g transform="translate(0 2.5)" fill="none" strokeWidth="3.4" strokeLinecap="round">
        <path
          d="M12 47C12.46 40.12 14.34 34.51 17.06 30.35"
          pathLength={1}
          className={`${styles.arc} ${styles.arcTakeoff}`}
        />
        <path
          d="M36.33 22.94C42.7 25.43 48.7 32.52 52 45"
          pathLength={1}
          className={`${styles.arc} ${styles.arcLanding}`}
        />
        <circle cx="12" cy="47" r="4.4" className={styles.origin} />
        <circle cx="25.33" cy="23.09" r="6.8" className={styles.lens} />
        <circle cx="52" cy="45" r="4.4" className={styles.destination} />
      </g>
    </svg>
  );
}
