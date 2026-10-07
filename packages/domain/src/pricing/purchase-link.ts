/**
 * SPEC-018 §"Validação do link antes de projetar": `PriceObservation.deeplink`
 * nunca chega a uma resposta HTTP sem passar por aqui, mesmo vindo do nosso
 * próprio banco — um provider real futuro pode gravar algo inesperado, e essa
 * é a fronteira antes de expor a URL ao usuário (CLAUDE.md §12: "URL externa
 * passa por allowlist e proteção SSRF").
 *
 * Allowlist por `providerStrategy`. Um provider real exige decisão humana
 * explícita (ADR) para entrar aqui, não é algo que esta função decide
 * sozinha (CLAUDE.md §21/§22). TRAVELPAYOUTS entrou pela ADR-008: o link é a
 * busca da Aviasales montada pelo adaptador (SPEC-030).
 */
const ALLOWED_PURCHASE_URL_HOSTS: Record<string, string> = {
  SIMULATED: 'booking.simulated-provider.flightwatch.dev',
  TRAVELPAYOUTS: 'www.aviasales.com',
};

/**
 * `null` quando o link não deve ser exposto: ausente, malformado, esquema
 * diferente de `https:`, ou host fora da allowlist do provider. Nunca lança —
 * uma URL ruim é um dado ausente, não um erro de requisição.
 */
export function resolvePurchaseUrl(
  deeplink: string | null | undefined,
  providerStrategy: string,
): string | null {
  if (!deeplink) {
    return null;
  }
  const allowedHost = ALLOWED_PURCHASE_URL_HOSTS[providerStrategy];
  if (!allowedHost) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(deeplink);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.hostname !== allowedHost) {
    return null;
  }
  return deeplink;
}

export type CurrentOfferStatus = 'CURRENT' | 'EXPIRED';

export function resolveCurrentOfferStatus(
  expiresAt: Date | null,
  now: Date = new Date(),
): CurrentOfferStatus {
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'CURRENT';
}
