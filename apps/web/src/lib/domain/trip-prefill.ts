/**
 * SPEC-045 — "Monitorar esta viagem": a busca leva ao formulário de novo
 * monitoramento já com rota e datas. O que vem pela URL é só sugestão do
 * formulário: cada parte é conferida e a inválida é ignorada (nunca lança),
 * e quem confirma e valida de verdade continua sendo a API.
 */

export type PrefillTripType = 'ONE_WAY' | 'ROUND_TRIP';

export interface WatchPrefillTrip {
  origin: string;
  destination: string;
  tripType: PrefillTripType;
  departureDate: string;
  returnDate: string | null;
}

export interface WatchPrefill {
  /** Código de cidade (3 letras maiúsculas) ou null quando ausente/inválido. */
  origin: string | null;
  destination: string | null;
  tripType: PrefillTripType;
  /** AAAA-MM-DD ou '' (vazio = o formulário pede). */
  departureDate: string;
  returnDate: string;
}

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildWatchPrefillHref(trip: WatchPrefillTrip): string {
  const params = new URLSearchParams({
    origin: trip.origin,
    destination: trip.destination,
    tripType: trip.tripType,
    departureDate: trip.departureDate,
  });
  if (trip.tripType === 'ROUND_TRIP' && trip.returnDate) {
    params.set('returnDate', trip.returnDate);
  }
  return `/watches/new?${params.toString()}`;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function code(value: string | string[] | undefined): string | null {
  const upper = first(value)?.trim().toUpperCase();
  return upper !== undefined && IATA.test(upper) ? upper : null;
}

function date(value: string | string[] | undefined): string {
  const text = first(value)?.trim();
  return text !== undefined && ISO_DATE.test(text) ? text : '';
}

export function parseWatchPrefill(
  params: Record<string, string | string[] | undefined>,
): WatchPrefill {
  const tripType: PrefillTripType =
    first(params.tripType) === 'ROUND_TRIP' ? 'ROUND_TRIP' : 'ONE_WAY';
  const departureDate = date(params.departureDate);
  let returnDate = tripType === 'ROUND_TRIP' ? date(params.returnDate) : '';
  // AAAA-MM-DD compara certo como texto; volta antes da ida não é viagem.
  if (returnDate !== '' && (departureDate === '' || returnDate <= departureDate)) {
    returnDate = '';
  }
  return {
    origin: code(params.origin),
    destination: code(params.destination),
    tripType,
    departureDate,
    returnDate,
  };
}
