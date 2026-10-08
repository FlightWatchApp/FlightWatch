'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ORIGIN_COOKIE_NAME, normalizeOriginCode } from './origin';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * SPEC-032: a origem escolhida fica num cookie de preferência (sem dado
 * pessoal, 1 ano) e na URL, para o link ser compartilhável.
 */
export async function chooseOriginAction(code: string): Promise<void> {
  const origin = normalizeOriginCode(code);
  if (!origin) return;
  const cookieStore = await cookies();
  cookieStore.set(ORIGIN_COOKIE_NAME, origin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  redirect(`/opportunities?origin=${origin}`);
}
