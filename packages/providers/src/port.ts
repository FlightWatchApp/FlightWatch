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

/** SPEC-032: o mais barato por destino a partir de uma origem (candidatos a promoção). */
export interface CheapestByDestinationQuery {
  /** Código de cidade (SPEC-029). */
  originIata: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  currency: string;
  market: string;
}

export interface DestinationFare {
  destinationIata: string;
  /** AAAA-MM-DD */
  departureDate: string;
  returnDate: string | null;
  amountMinor: number;
  stops: number;
  /** Hora em que a fonte viu o preço (SPEC-030), nunca no futuro. */
  observedAt: string;
}

export interface FlightProvider {
  readonly strategy: string;
  search(query: FlightSearchQuery, context: ProviderContext): Promise<ProviderSearchResult>;
  /** SPEC-031 (opcional): menor preço por dia no mês. */
  priceCalendar?(query: PriceCalendarQuery): Promise<CalendarDay[]>;
  /** SPEC-031 (opcional): busca completa no site parceiro ("ver todos os voos"). */
  allFlightsUrl?(query: FlightSearchQuery): string;
  /** SPEC-032 (opcional): um preço por destino; sem a capacidade, o feed fica vazio. */
  cheapestByDestination?(query: CheapestByDestinationQuery): Promise<DestinationFare[]>;
}
