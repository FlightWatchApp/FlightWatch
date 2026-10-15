/**
 * SPEC-042: `/healthz` do web, consultado pelo monitor externo de site fora do
 * ar e pelo healthcheck do contêiner. 200 só se a API responder `/health` em
 * até 3 s; o corpo nunca traz detalhe (CLAUDE.md §11.3).
 */
export const HEALTH_TIMEOUT_MS = 3000;

export async function healthResponse(
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let healthy = false;
  try {
    const response = await fetchImpl(`${apiBaseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    healthy = response.ok;
  } catch {
    healthy = false;
  }
  return new Response(healthy ? 'ok' : 'indisponível', {
    status: healthy ? 200 : 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
