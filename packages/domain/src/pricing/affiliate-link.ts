/**
 * SPEC-020 — link de compra com rastreio de afiliado. Roda depois de
 * `resolvePurchaseUrl` (SPEC-018): só acrescenta parâmetros de query a um
 * deeplink já validado (https + host na allowlist do provider). Nunca troca
 * esquema, host ou caminho — a proteção contra URL maliciosa continua sendo
 * a allowlist de SPEC-018, aplicada antes desta função.
 *
 * Os parâmetros vêm de configuração do operador (variável de ambiente), nunca
 * de entrada do usuário, mas passam por um charset restrito mesmo assim: um
 * valor com `&`, `=`, `/` ou `:` poderia injetar outro parâmetro ou um
 * redirecionamento no link do parceiro.
 */

/** Onde a pessoa clicou — vira `utm_campaign`, baixa cardinalidade. */
export type PurchaseSurface = 'WATCH' | 'SEARCH' | 'OPPORTUNITY';

/** Parâmetros de afiliado por `providerStrategy`, ex.: `{ SIMULATED: { marker: '123' } }`. */
export type AffiliateTrackingConfig = Record<string, Record<string, string>>;

export interface ParsedAffiliateTrackingConfig {
  /** `false` quando a variável existe mas é inválida — o chamador loga e segue sem afiliado. */
  ok: boolean;
  config: AffiliateTrackingConfig;
}

export const AFFILIATE_UTM_SOURCE = 'flightwatch';
const AFFILIATE_UTM_MEDIUM = 'affiliate';

const RESERVED_PARAM_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign']);
const SAFE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Nunca lança. Configuração ausente ou em branco é válida e vazia; qualquer
 * outra forma inesperada vira `ok: false` — um link sem comissão é melhor
 * que um link quebrado ou nenhum link.
 */
export function parseAffiliateTrackingConfig(
  raw: string | undefined,
): ParsedAffiliateTrackingConfig {
  if (raw === undefined || raw.trim() === '') {
    return { ok: true, config: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, config: {} };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, config: {} };
  }

  const config: AffiliateTrackingConfig = {};
  for (const [providerStrategy, params] of Object.entries(parsed)) {
    if (!isPlainObject(params)) {
      return { ok: false, config: {} };
    }
    const safeParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (
        typeof value !== 'string' ||
        RESERVED_PARAM_KEYS.has(key) ||
        !SAFE_KEY_PATTERN.test(key) ||
        !SAFE_VALUE_PATTERN.test(value)
      ) {
        return { ok: false, config: {} };
      }
      safeParams[key] = value;
    }
    config[providerStrategy] = safeParams;
  }
  return { ok: true, config };
}

/**
 * Sem parâmetros configurados para o `providerStrategy`, devolve a URL
 * idêntica — não marca como link de afiliado algo que não é. URL que não
 * parseia também volta sem alteração.
 */
export function applyAffiliateTracking(
  purchaseUrl: string,
  providerStrategy: string,
  surface: PurchaseSurface,
  config: AffiliateTrackingConfig,
): string {
  const params = config[providerStrategy];
  if (!params || Object.keys(params).length === 0) {
    return purchaseUrl;
  }

  let url: URL;
  try {
    url = new URL(purchaseUrl);
  } catch {
    return purchaseUrl;
  }

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('utm_source', AFFILIATE_UTM_SOURCE);
  url.searchParams.set('utm_medium', AFFILIATE_UTM_MEDIUM);
  url.searchParams.set('utm_campaign', surface.toLowerCase());
  return url.toString();
}
