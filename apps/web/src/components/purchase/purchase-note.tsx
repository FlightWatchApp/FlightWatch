import Link from 'next/link';
import styles from './purchase-note.module.css';

export interface PurchaseNoteProps {
  align?: 'start' | 'center';
}

/**
 * SPEC-020 §"Transparência na interface": aviso obrigatório perto de todo CTA
 * de compra — quem vende é o parceiro e o link pode render comissão (CONAR,
 * Guia de Publicidade por Influenciadores Digitais — identificar vínculo
 * comercial).
 */
export function PurchaseNote({ align = 'start' }: PurchaseNoteProps) {
  return (
    <p className={`${styles.note} ${align === 'center' ? styles.center : ''}`}>
      Você finaliza a compra no site parceiro. Podemos receber comissão, sem custo extra para você.{' '}
      <Link href="/transparencia">Saiba mais</Link>
    </p>
  );
}
