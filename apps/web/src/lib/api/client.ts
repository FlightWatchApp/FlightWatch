import { headers as requestHeaders } from 'next/headers';
import { readSessionToken } from '@/lib/auth/session';
import { clientIpFrom, internalApiHeaders, resolveInternalApiSecret } from './internal-headers';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** SPEC-043: dados do erro quando a API manda (ex.: limite e dia em que a cota volta). */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string | undefined,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.details = details;
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
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
      // Sem corpo, o Fastify rejeita um content-type JSON (400): só declara quando há corpo.
      ...(init.body === undefined || init.body === null
        ? {}
        : { 'content-type': 'application/json' }),
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
      body?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
