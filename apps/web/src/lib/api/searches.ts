import type { FlightSearchResponse, PriceCalendarResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';
import type { FlightSearchResult } from './types';

export interface SearchFlightsInput {
  origin: string;
  destination: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  departureDate: string;
  returnDate: string | null;
  currency: string;
  market: string;
  maxStops: number | null;
  maxPriceMinor: number | null;
}

/** SPEC-014: público — funciona sem sessão (apiFetch só anexa o header se houver token). */
export async function searchFlights(input: SearchFlightsInput): Promise<FlightSearchResult> {
  return apiFetch<FlightSearchResponse>('/v1/searches/flights', {
    method: 'POST',
    body: JSON.stringify({
      origin: input.origin,
      destination: input.destination,
      tripType: input.tripType,
      departureDate: input.departureDate,
      returnDate: input.tripType === 'ROUND_TRIP' ? input.returnDate : null,
      dateFlexibilityDays: 0,
      cabin: 'ECONOMY',
      adults: 1,
      currency: input.currency,
      market: input.market,
      maxStops: input.maxStops,
      maxPriceMinor: input.maxPriceMinor,
    }),
  });
}

export async function getFlightSearch(id: string): Promise<FlightSearchResult> {
  return apiFetch<FlightSearchResponse>(`/v1/searches/flights/${id}`);
}

/** SPEC-031: menor preço por dia do mês (público, mesmo rate limit da busca). */
export async function getPriceCalendar(input: {
  origin: string;
  destination: string;
  month: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  tripLengthDays: number | null;
  currency: string;
  market: string;
}): Promise<PriceCalendarResponse> {
  const params = new URLSearchParams({
    origin: input.origin,
    destination: input.destination,
    month: input.month,
    tripType: input.tripType,
    currency: input.currency,
    market: input.market,
  });
  if (input.tripLengthDays !== null) {
    params.set('tripLengthDays', String(input.tripLengthDays));
  }
  return apiFetch<PriceCalendarResponse>(`/v1/price-calendar?${params.toString()}`);
}

export interface DeriveWatchFromOfferInput {
  notificationChannelId: string;
}

/** SPEC-039: sem regras do cliente — a API cria o alerta de preço baixo. */
export async function deriveWatchFromOffer(
  offerId: string,
  input: DeriveWatchFromOfferInput,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/v1/offers/${offerId}/watch`, {
    method: 'POST',
    body: JSON.stringify({
      notificationChannelId: input.notificationChannelId,
    }),
  });
}
