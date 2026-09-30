import { redirect } from 'next/navigation';
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

  return <NewWatchForm />;
}
