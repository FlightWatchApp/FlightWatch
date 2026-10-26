import {
  type PurchasePartner,
  type PurchaseSurface,
  type PurchaseTrip,
  buildDecolarSearchUrl,
  resolvePurchaseUrl,
} from '@flight-watch/domain';
import { withAffiliateTracking } from './affiliate-links.js';

/** Chave do destino Decolar na allowlist e na configuração de afiliado. */
const DECOLAR = 'DECOLAR';

export interface PartnerLinkInput {
  /** `PURCHASE_PARTNER` da configuração. */
  partner: PurchasePartner;
  /** A viagem: o link da Decolar é montado a partir dela. */
  trip: PurchaseTrip;
  /** Estratégia da fonte de preços, ex.: `TRAVELPAYOUTS` (allowlist e afiliado do modo `provider`). */
  providerStrategy: string;
  /**
   * Link da própria fonte — o `deeplink` gravado ou o `allFlightsUrl` do
   * provedor. Só vale no modo `provider`; no modo `decolar` é ignorado de
   * propósito (ver `purchase-partner.ts`).
   */
  providerUrl: string | null | undefined;
  surface: PurchaseSurface;
}

/**
 * SPEC-044: o único lugar que decide o destino do botão de compra. Todo link
 * passa pela allowlist (SPEC-018) e só depois recebe o afiliado (SPEC-020);
 * `null` quando não há link seguro — nunca uma URL sem validar.
 */
export function resolvePartnerLink(input: PartnerLinkInput): string | null {
  if (input.partner === 'decolar') {
    return withAffiliateTracking(
      resolvePurchaseUrl(buildDecolarSearchUrl(input.trip), DECOLAR),
      DECOLAR,
      input.surface,
    );
  }
  return withAffiliateTracking(
    resolvePurchaseUrl(input.providerUrl, input.providerStrategy),
    input.providerStrategy,
    input.surface,
  );
}
