import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { getCurrentUser } from '@/lib/api/auth';
import { MainNav } from './main-nav';
import styles from './site-header.module.css';

/** CP-11: cabeçalho fixo, fundo petróleo, com `MainNav` à direita. */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label="Flight Watch, página inicial">
          <Logo size="sm" animated inverse />
        </Link>
        <MainNav userEmail={user?.email ?? null} />
      </div>
    </header>
  );
}
