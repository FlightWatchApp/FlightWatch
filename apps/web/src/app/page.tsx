import { redirect } from 'next/navigation';
import Link from 'next/link';
import { EmailVerificationBanner } from '@/components/account/email-verification-banner';
import buttonStyles from '@/components/ui/button.module.css';
import { EmptyState } from '@/components/ui/empty-state';
import { IconPlus, IconSearch } from '@/components/ui/icon';
import { WatchCard } from '@/components/watches/watch-card';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { listWatches } from '@/lib/api/watches';
import styles from './page.module.css';

const primaryButton = [buttonStyles.button, buttonStyles.primary, buttonStyles.md].join(' ');

export default async function HomePage() {
  let watches;
  let user;
  try {
    [watches, user] = await Promise.all([listWatches(), getCurrentUser()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <div className={`container ${styles.page}`}>
      {user && !user.notificationChannelVerified && <EmailVerificationBanner />}

      <div className={styles.header}>
        <div>
          <h1>Seus monitoramentos</h1>
          <p className={styles.subtitle}>Acompanhe o preço das viagens que você está observando.</p>
        </div>
        <Link href="/watches/new" className={primaryButton}>
          <IconPlus size={18} />
          Novo monitoramento
        </Link>
      </div>

      {watches.length === 0 ? (
        <EmptyState
          icon={<IconSearch size={28} />}
          title="Nenhum monitoramento ainda"
          description="Crie um monitoramento para receber um alerta quando o preço da sua viagem cair."
          action={
            <Link href="/watches/new" className={primaryButton}>
              Criar meu primeiro monitoramento
            </Link>
          }
        />
      ) : (
        <ul className={styles.list}>
          {watches.map((watch) => (
            <li key={watch.id}>
              <WatchCard watch={watch} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
