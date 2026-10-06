import { headers as requestHeaders } from 'next/headers';
import { readSessionToken } from '@/lib/auth/session';
import { clientIpFrom, internalApiHeaders, resolveInternalApiSecret } from './internal-headers';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  code?: string;
  message?: string;
}

/**
 * Só chamável de dentro de um Server Component/Action/Route Handler — depende
 * de `cookies()` (via readSessionToken), que só existe no request scope do
 * Next.js. apps/api nunca recebe cookie, só o bearer token (ADR-006).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await readSessionToken();
  const incoming = await requestHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      // SPEC-025: IP do cliente para o rate limit da API, autenticado pelo
      // segredo interno.
      ...internalApiHeaders({
        clientIp: clientIpFrom(incoming.get('x-forwarded-for'), incoming.get('x-real-ip')),
        secret: resolveInternalApiSecret(process.env),
      }),
      ...init.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(
      response.status,
      body?.code,
      body?.message ?? `request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
