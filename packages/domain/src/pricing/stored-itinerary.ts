import type { FareSummary, FlightOffer, FlightOfferSegment } from './flight-offer.js';

/**
 * SPEC-030 — formato do itinerário gravado em JSON (`PriceObservation.itinerary`,
 * `FlightSearchOffer.itinerary`). O domínio é o dono do formato: quem grava usa
 * `toStoredItinerary`, quem lê usa `parseStoredItinerary` — nada de cast solto.
 *
 * - trechos: lista (formato anterior à spec; dados antigos continuam válidos);
 * - resumo de tarifa: `{ kind: 'FARE_SUMMARY', ...FareSummary }`.
 */

export type StoredItinerary =
  | { kind: 'SEGMENTS'; segments: FlightOfferSegment[] }
  | { kind: 'FARE_SUMMARY'; summary: FareSummary };

export class InvalidStoredItineraryError extends Error {
  constructor(reason: string) {
    super(`invalid stored itinerary: ${reason}`);
    this.name = 'InvalidStoredItineraryError';
  }
}

export function toStoredItinerary(offer: FlightOffer): unknown {
  if (offer.fareSummary) {
    return { kind: 'FARE_SUMMARY', ...offer.fareSummary };
  }
  return offer.segments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSegment(value: unknown): value is FlightOfferSegment {
  return (
    isRecord(value) &&
    typeof value.originIata === 'string' &&
    typeof value.destinationIata === 'string' &&
    typeof value.departureAt === 'string' &&
    typeof value.arrivalAt === 'string' &&
    typeof value.carrier === 'string'
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function toFareSummary(value: Record<string, unknown>): FareSummary {
  const { originCode, destinationCode, departureDate, returnDate, stops, durationMinutes } = value;
  if (
    typeof originCode !== 'string' ||
    typeof destinationCode !== 'string' ||
    typeof departureDate !== 'string' ||
    !DATE.test(departureDate) ||
    !(returnDate === null || (typeof returnDate === 'string' && DATE.test(returnDate))) ||
    typeof stops !== 'number' ||
    !(durationMinutes === null || typeof durationMinutes === 'number')
  ) {
    throw new InvalidStoredItineraryError('malformed FARE_SUMMARY');
  }
  return { originCode, destinationCode, departureDate, returnDate, stops, durationMinutes };
}

export function parseStoredItinerary(value: unknown): StoredItinerary {
  if (Array.isArray(value)) {
    if (!value.every(isSegment)) {
      throw new InvalidStoredItineraryError('malformed segment list');
    }
    return { kind: 'SEGMENTS', segments: value };
  }
  if (isRecord(value) && value.kind === 'FARE_SUMMARY') {
    return { kind: 'FARE_SUMMARY', summary: toFareSummary(value) };
  }
  throw new InvalidStoredItineraryError('unknown format');
}

/** Oferta mínima a partir do itinerário gravado, para os derivados (escalas, duração). */
export function storedItineraryAsOffer(
  itinerary: StoredItinerary,
): Pick<FlightOffer, 'segments' | 'fareSummary'> {
  return itinerary.kind === 'FARE_SUMMARY'
    ? { segments: [], fareSummary: itinerary.summary }
    : { segments: itinerary.segments };
}
