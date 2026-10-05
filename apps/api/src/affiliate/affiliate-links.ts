import {
  applyAffiliateTracking,
  parseAffiliateTrackingConfig,
  type AffiliateTrackingConfig,
  type PurchaseSurface,
} from '@flight-watch/domain';
import { logEvent } from '@flight-watch/observability';

/**
 * SPEC-020: `AFFILIATE_TRACKING_PARAMS` é lida e validada uma vez por
 * processo, não a cada requisição — igual à allowlist de SPEC-018. Trocar a
 * variável exige reiniciar a API.
 */
let cachedConfig: AffiliateTrackingConfig | undefined;

function affiliateConfig(): AffiliateTrackingConfig {
  if (cachedConfig === undefined) {
    const result = parseAffiliateTrackingConfig(process.env.AFFILIATE_TRACKING_PARAMS);
    if (!result.ok) {
      logEvent({ event: 'affiliate_config_invalid' });
    }
    cachedConfig = result.config;
  }
  return cachedConfig;
}

/** Só para testes que trocam `AFFILIATE_TRACKING_PARAMS` entre casos. */
export function resetAffiliateConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * Recebe o resultado de `resolvePurchaseUrl` (SPEC-018): `null` continua
 * `null`; uma URL já validada só ganha parâmetros de rastreio de afiliado.
 */
export function withAffiliateTracking(
  purchaseUrl: string,
  providerStrategy: string,
  surface: PurchaseSurface,
): string;
export function withAffiliateTracking(
  purchaseUrl: string | null,
  providerStrategy: string,
  surface: PurchaseSurface,
): string | null;
export function withAffiliateTracking(
  purchaseUrl: string | null,
  providerStrategy: string,
  surface: PurchaseSurface,
): string | null {
  if (!purchaseUrl) {
    return null;
  }
  return applyAffiliateTracking(purchaseUrl, providerStrategy, surface, affiliateConfig());
}
