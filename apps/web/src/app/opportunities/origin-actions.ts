'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { updateHomeCity } from '@/lib/api/me';
import { ORIGIN_COOKIE_NAME, normalizeOriginCode } from './origin';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * SPEC-032: a origem escolhida fica num cookie de preferência (sem dado
 * pessoal, 1 ano) e na URL, para o link ser compartilhável. SPEC-040: com
 * sessão, vira também a cidade da conta (vale em qualquer aparelho).
 */
export async function chooseOriginAction(code: string): Promise<void> {
  const origin = await saveOrigin(code);
  if (!origin) return;
  redirect(`/opportunities?origin=${origin}`);
}

/** Mesma preferência, escolhida no cartão da página inicial: volta para a página inicial. */
export async function chooseHomeOriginAction(code: string): Promise<void> {
  const origin = await saveOrigin(code);
  if (!origin) return;
  redirect('/');
}

async function saveOrigin(code: string): Promise<string | null> {
  const origin = normalizeOriginCode(code);
  if (!origin) return null;
  const cookieStore = await cookies();
  cookieStore.set(ORIGIN_COOKIE_NAME, origin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  // Melhor esforço: falhar ao gravar na conta não impede a escolha neste navegador.
  if (await getCurrentUser().catch(() => null)) {
    await updateHomeCity(origin).catch(() => null);
  }
  return origin;
}
