/**
 * SPEC-042: estatística do beta (Umami) pelo próprio domínio. O navegador só
 * fala com o site (`/stats/script.js` e `/stats/api/send`); o web repassa ao
 * Umami na rede interna (`UMAMI_INTERNAL_URL`). Assim a CSP continua só com o
 * próprio site e nenhum script de terceiro é carregado. Sem a variável, 404.
 */
export const STATS_TIMEOUT_MS = 3000;
export const STATS_MAX_BODY_BYTES = 16 * 1024;

/** Cabeçalhos que o Umami usa para contar a visita (navegador e cidade, sem guardar o IP). */
const FORWARDED_HEADERS = [
  'user-agent',
  'accept-language',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ipcity',
  'cf-region-code',
] as const;

/**
 * Sem query string e sem âncora: links de confirmação de e-mail e de nova senha
 * levam o token na query. Feito aqui, e não no navegador, porque o script do
 * Umami só limpa a query depois da primeira visita.
 */
export function withoutQuery(url: string): string {
  const parsed = new URL(url, 'http://placeholder');
  parsed.search = '';
  parsed.hash = '';
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? parsed.toString() : parsed.pathname;
}

function sanitizeEvent(raw: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof event !== 'object' || event === null) return null;
  const payload = (event as { payload?: unknown }).payload;
  if (typeof payload === 'object' && payload !== null) {
    const fields = payload as Record<string, unknown>;
    for (const key of ['url', 'referrer'] as const) {
      const value = fields[key];
      if (typeof value === 'string' && value) {
        try {
          fields[key] = withoutQuery(value);
        } catch {
          // Não é URL: não repassa nada do campo.
          fields[key] = '';
        }
      }
    }
  }
  return JSON.stringify(event);
}

const notFound = () => new Response(null, { status: 404 });
const unavailable = () => new Response(null, { status: 502 });

export async function proxyStatsScript(
  umamiUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!umamiUrl) return notFound();
  try {
    const upstream = await fetchImpl(`${umamiUrl}/script.js`, {
      signal: AbortSignal.timeout(STATS_TIMEOUT_MS),
    });
    if (!upstream.ok) return unavailable();
    return new Response(await upstream.text(), {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch {
    return unavailable();
  }
}

export async function proxyStatsEvent(
  request: Request,
  umamiUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!umamiUrl) return notFound();
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > STATS_MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const sanitized = sanitizeEvent(body);
  if (sanitized === null) return new Response(null, { status: 400 });
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetchImpl(`${umamiUrl}/api/send`, {
      method: 'POST',
      headers,
      body: sanitized,
      signal: AbortSignal.timeout(STATS_TIMEOUT_MS),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return unavailable();
  }
}
