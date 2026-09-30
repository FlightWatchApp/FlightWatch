import Link from 'next/link';
import { logoutAction } from '@/app/logout/actions';
import { BrandMark } from '@/components/ui/brand-mark';
import { IconLogOut, IconUser } from '@/components/ui/icon';
import { getCurrentUser } from '@/lib/api/auth';
import styles from './site-header.module.css';

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand}>
          <BrandMark />
          <span className={styles.name}>Flight Watch</span>
        </Link>

        {user ? (
          <div className={styles.session}>
            <Link href="/search" className={styles.sessionLink}>
              Buscar passagens
            </Link>
            <Link href="/opportunities" className={styles.sessionLink}>
              Promoções
            </Link>
            <span className={styles.userEmail}>
              <IconUser size={16} />
              {user.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className={styles.sessionLink}>
                <IconLogOut size={16} />
                Sair
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.session}>
            <Link href="/search" className={styles.sessionLink}>
              Buscar passagens
            </Link>
            <Link href="/opportunities" className={styles.sessionLink}>
              Promoções
            </Link>
            <Link href="/login" className={styles.sessionLink}>
              Entrar
            </Link>
            <Link href="/register" className={styles.sessionLink}>
              Criar conta
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
