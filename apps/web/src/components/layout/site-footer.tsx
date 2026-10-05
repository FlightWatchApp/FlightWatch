import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import styles from './site-footer.module.css';

/** CP-12: logo pequeno + lema, links de rodapé e o aviso de comissão fixo. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brandCol}>
          <Logo size="sm" />
          <p className={styles.tagline}>Passagens observadas de perto.</p>
        </div>

        <nav aria-label="Rodapé" className={styles.links}>
          <Link href="/opportunities">Promoções</Link>
          <Link href="/search">Buscar passagens</Link>
          <Link href="/transparencia">Como ganhamos dinheiro</Link>
        </nav>

        <p className={styles.disclaimer}>
          O Flight Watch observa preços e leva você ao site parceiro para comprar. Não vendemos nem
          emitimos passagens. Alguns links são de afiliados: podemos receber uma comissão do
          parceiro, sem custo extra para você. Preços observados podem mudar até a compra.
        </p>
        <p className={styles.meta}>© {year} Flight Watch</p>
      </div>
    </footer>
  );
}
