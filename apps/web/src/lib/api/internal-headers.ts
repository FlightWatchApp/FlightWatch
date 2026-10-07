import { LOCAL_INTERNAL_API_SECRET } from '@flight-watch/config';
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@flight-watch/contracts';

/**
 * SPEC-025: o web é o único cliente da API (ADR-006), então a API só vê o IP
 * deste servidor. Repassamos o IP de quem está no navegador, autenticado pelo
 * segredo interno, para o rate limit valer por pessoa e não para o site todo.
 *
 * Confiamos no `x-forwarded-for` recebido: em produção o web fica atrás do
 * proxy da plataforma de hospedagem, que define esse header.
 */
export function clientIpFrom(
  forwardedFor: string | null,
  realIp: string | null,
): string | undefined {
  const first = forwardedFor?.split(',')[0]?.trim() || realIp?.trim();
  return first || undefined;
}

export function internalApiHeaders(input: {
  clientIp: string | undefined;
  secret: string;
}): Record<string, string> {
  return {
    [INTERNAL_SECRET_HEADER]: input.secret,
    ...(input.clientIp ? { [CLIENT_IP_HEADER]: input.clientIp } : {}),
  };
}

/**
 * Em produção, sem a variável, falha alto na primeira chamada à API em vez de
 * seguir sem identificar o cliente (o rate limit voltaria a ser global).
 */
export function resolveInternalApiSecret(env: {
  INTERNAL_API_SECRET?: string | undefined;
  NODE_ENV?: string | undefined;
}): string {
  if (env.INTERNAL_API_SECRET) {
    return env.INTERNAL_API_SECRET;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('INTERNAL_API_SECRET é obrigatória em produção (SPEC-025)');
  }
  return LOCAL_INTERNAL_API_SECRET;
}
