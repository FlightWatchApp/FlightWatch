import { BrandSymbol } from './brand-symbol';
import styles from './logo.module.css';

export interface LogoProps {
  size?: 'sm' | 'md';
  animated?: boolean;
  /** Texto branco para uso sobre fundo petróleo. */
  inverse?: boolean;
}

/**
 * Assinatura horizontal da marca (CP-02): símbolo + "Flight Watch" em texto
 * real — acessível e selecionável, nunca imagem. Substitui a marca antiga
 * de `components/ui/` (removida) em todo lugar que a usava.
 */
export function Logo({ size = 'md', animated = false, inverse = false }: LogoProps) {
  return (
    <span className={`${styles.logo} ${styles[size]} ${inverse ? styles.inverse : ''}`}>
      <BrandSymbol size={size === 'sm' ? 24 : 32} animated={animated} />
      <span className={styles.wordmark}>Flight Watch</span>
    </span>
  );
}
