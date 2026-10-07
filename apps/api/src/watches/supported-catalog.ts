/**
 * SPEC-029: aeroportos e cidades vêm do catálogo (`places`), não daqui. Moeda
 * e mercado continuam fixos por decisão de negócio — não são dado de catálogo.
 */
export const SUPPORTED_CURRENCIES = new Set(['BRL', 'USD']);
export const SUPPORTED_MARKETS = new Set(['BR']);

export function isSupportedCurrencyAndMarket(params: {
  currency: string;
  market: string;
}): boolean {
  return SUPPORTED_CURRENCIES.has(params.currency) && SUPPORTED_MARKETS.has(params.market);
}
