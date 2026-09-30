import { cookies } from 'next/headers';

/**
 * apps/web é o BFF (ADR-006): a sessão trafega como cookie httpOnly só entre o
 * browser e este servidor Next.js — nunca chega em apps/api, que recebe o
 * token via `Authorization: Bearer` numa chamada server-to-server (ver
 * lib/api/client.ts).
 */
export const SESSION_COOKIE_NAME = 'fw_session';

export async function readSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
