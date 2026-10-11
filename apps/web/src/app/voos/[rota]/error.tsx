'use client';

import Link from 'next/link';
import styles from '@/components/route/route-page.module.css';

/**
 * SPEC-033: a API recusou (muitas consultas seguidas) ou falhou. A página
 * explica e oferece tentar de novo — nunca um erro cru.
 */
export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.facts}>
        <h1 className={styles.sectionTitle}>Não foi possível abrir esta rota agora</h1>
        <p>
          Pode ter sido um excesso de consultas seguidas ou uma falha momentânea. Espere alguns
          segundos e tente de novo.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={reset}>
            Tentar de novo
          </button>
          <Link href="/search" prefetch={false}>
            Buscar passagens
          </Link>
        </div>
      </div>
    </div>
  );
}
