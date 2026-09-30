/**
 * Placeholder — ADR-004 ainda não define o provedor real, então não há catálogo
 * oficial de aeroportos/moedas/mercados suportados ainda. Esta lista existe só
 * para SPEC-001 ter algo concreto para validar contra; deve virar configuração
 * (packages/config) vinda do provedor escolhido, não uma constante no código.
 */
export const SUPPORTED_IATA_CODES = new Set(['DOU', 'GRU', 'GIG', 'CGH', 'BSB', 'JFK', 'MIA']);
export const SUPPORTED_CURRENCIES = new Set(['BRL', 'USD']);
export const SUPPORTED_MARKETS = new Set(['BR']);

export function isSupportedSearch(params: {
  origin: string;
  destination: string;
  currency: string;
  market: string;
}): boolean {
  return (
    SUPPORTED_IATA_CODES.has(params.origin) &&
    SUPPORTED_IATA_CODES.has(params.destination) &&
    SUPPORTED_CURRENCIES.has(params.currency) &&
    SUPPORTED_MARKETS.has(params.market)
  );
}
