import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { getMeOverview } from '@/lib/api/me';
import { quotaLabel } from '@/lib/domain/watch-quota';
import { readSessionToken } from '@/lib/auth/session';
import { NewWatchForm } from './new-watch-form';

/**
 * Checagem de presença do cookie só — UX (evita renderizar o formulário e só
 * então redirecionar), não o limite de segurança real, que continua sendo o
 * SessionAuthGuard em apps/api validando o token contra o banco.
 */
export default async function NewWatchPage() {
  const token = await readSessionToken();
  if (!token) {
    redirect('/login');
  }

  const user = await getCurrentUser().catch(() => null);
  const overview = await getMeOverview().catch(() => null);
  return (
    <NewWatchForm
      initialOrigin={user?.homeCity ?? null}
      quota={overview ? quotaLabel(overview.watchQuota) : null}
    />
  );
}
