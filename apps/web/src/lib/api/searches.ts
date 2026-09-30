import type { FlightSearchResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';
import type { AlertRuleType, FlightSearchResult } from './types';

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

export interface DeriveWatchFromOfferInput {
  targetAmountMinor: number;
  notificationChannelId: string;
}

/**
 * Só cobre TARGET_PRICE, mesmo recorte de `createWatch()` em
 * apps/web/src/lib/api/watches.ts — o formulário ainda não expõe as outras
 * 3 regras.
 */
export async function deriveWatchFromOffer(
  offerId: string,
  input: DeriveWatchFromOfferInput,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/v1/offers/${offerId}/watch`, {
    method: 'POST',
    body: JSON.stringify({
      alertRules: [
        {
          type: 'TARGET_PRICE' satisfies AlertRuleType,
          amountMinor: input.targetAmountMinor,
          cooldownSeconds: 43_200,
        },
      ],
      notificationChannelId: input.notificationChannelId,
    }),
  });
}
