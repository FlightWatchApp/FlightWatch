'use server';

import { redirect } from 'next/navigation';
import { logout } from '@/lib/api/auth';
import { clearSessionCookie } from '@/lib/auth/session';

/**
 * Best-effort: mesmo se a API já não tiver mais a sessão (token expirado,
 * já deslogado em outra aba), ainda limpamos o cookie local e redirecionamos
 * — o objetivo é sempre terminar deslogado do ponto de vista do browser.
 */
export async function logoutAction(): Promise<void> {
  try {
    await logout();
  } catch {
    // Best-effort — ver comentário acima.
  }
  await clearSessionCookie();
  redirect('/login');
}
