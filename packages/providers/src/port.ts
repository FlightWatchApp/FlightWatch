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
/** SPEC-031: calendário de preços de um mês. */
export interface PriceCalendarQuery {
  originIata: string;
  destinationIata: string;
  /** AAAA-MM */
  month: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  /** Ida e volta: só combinações com esta duração (retorno − ida, em dias). */
  tripLengthDays: number | null;
  currency: string;
}

export interface CalendarDay {
  /** AAAA-MM-DD */
  date: string;
  amountMinor: number;
  stops: number;
  observedAt: string;
}

export interface FlightProvider {
  readonly strategy: string;
  search(query: FlightSearchQuery, context: ProviderContext): Promise<ProviderSearchResult>;
  /** SPEC-031 (opcional): menor preço por dia no mês. */
  priceCalendar?(query: PriceCalendarQuery): Promise<CalendarDay[]>;
  /** SPEC-031 (opcional): busca completa no site parceiro ("ver todos os voos"). */
  allFlightsUrl?(query: FlightSearchQuery): string;
}
