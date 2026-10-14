import type { RouteOfferFlight } from '@flight-watch/contracts';

/**
 * SPEC-038, só apresentação da página da oferta. Nada aqui decide preço ou
 * promoção — isso vem pronto da API.
 */

const LOCAL_TIME = /T(\d{2}):(\d{2})/;

/** "2026-11-29T10:10:00-03:00" → "10:10" (horário local da origem, sem converter fuso). */
export function localDepartureTime(departureAt: string): string | null {
  const match = LOCAL_TIME.exec(departureAt);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** "Azul Airlines · AD 4193" (só o código quando o catálogo não tem o nome). */
export function flightLabel(
  flight: Pick<RouteOfferFlight, 'carrierCode' | 'carrierName' | 'flightNumber'>,
): string {
  const number = flight.flightNumber
    ? `${flight.carrierCode} ${flight.flightNumber}`
    : flight.carrierCode;
  return flight.carrierName ? `${flight.carrierName} · ${number}` : number;
}

/** Logo da companhia pelo CDN da fonte, servido pelo nosso domínio via `next/image`. */
export function airlineLogoUrl(carrierCode: string): string {
  return `https://pics.avs.io/120/120/${encodeURIComponent(carrierCode)}.png`;
}

/** Segmento de data da URL da oferta: AAAA-MM-DD válido. */
export function isOfferDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
