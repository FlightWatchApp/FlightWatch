import type { FlightOffer } from '@flight-watch/domain';

export interface FlightSearchQuery {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  cabin: string;
  adults: number;
  currency: string;
  market: string;
}

export interface ProviderContext {
  correlationId: string;
  searchExecutionId: string;
}

export type ProviderSearchResult =
  | { kind: 'offers'; offers: FlightOffer[]; providerRequestId?: string }
  | { kind: 'no_offers'; providerRequestId?: string };

/**
 * ADR-004: porta interna comum a todos os provedores. Tipos de SDK nunca
 * atravessam essa fronteira — cada adaptador traduz para FlightOffer/ProviderError.
 */
export interface FlightProvider {
  readonly strategy: string;
  search(query: FlightSearchQuery, context: ProviderContext): Promise<ProviderSearchResult>;
}
