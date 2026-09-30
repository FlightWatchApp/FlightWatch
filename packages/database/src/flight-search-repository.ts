import type {
  FlightSearch,
  FlightSearchOffer,
  FlightSearchStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

// SPEC-014: FlightSearch/FlightSearchOffer são um conceito de descoberta
// pontual, separado do pipeline de monitoramento recorrente (SearchTarget/
// SearchExecution/PriceObservation) — ver nota no schema.prisma. As funções
// deste arquivo cobrem só o que não existe em price-observation-repository.ts
// (claimSearchExecutionForRunning/persistPriceObservationSuccess são
// reusadas como estão pela orquestração em apps/api, não duplicadas aqui).

export interface CreateFlightSearchInput {
  userId: string | null;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  cabin: string;
  adults: number;
  currency: string;
  market: string;
  maxStops: number | null;
  maxPriceMinor: number | null;
  correlationId: string;
}

/** SPEC-014 §"Comportamento": passo 2 — cria a busca já com status PENDING. */
export async function createPendingFlightSearch(
  prisma: PrismaClient,
  input: CreateFlightSearchInput,
): Promise<FlightSearch> {
  return prisma.flightSearch.create({
    data: {
      userId: input.userId,
      originIata: input.originIata,
      destinationIata: input.destinationIata,
      departureDate: new Date(input.departureDate),
      returnDate: input.returnDate ? new Date(input.returnDate) : null,
      tripType: input.tripType,
      cabin: input.cabin,
      adults: input.adults,
      currency: input.currency,
      market: input.market,
      maxStops: input.maxStops,
      maxPriceMinor: input.maxPriceMinor,
      correlationId: input.correlationId,
      status: 'PENDING',
    },
  });
}

export interface FlightSearchOfferInsertInput {
  providerStrategy: string;
  providerOfferId: string;
  totalAmountMinor: number;
  currency: string;
  passengerCount: number;
  itinerary: Prisma.InputJsonValue;
  offerSignature: string;
  observedAt: Date;
  expiresAt: Date | null;
  deeplink: string | null;
  qualityFlags: string[];
}

export interface CompleteFlightSearchInput {
  flightSearchId: string;
  status: Extract<FlightSearchStatus, 'SUCCEEDED' | 'FAILED'>;
  offers: FlightSearchOfferInsertInput[];
  offersReturnedCount: number;
  offersEligibleCount: number;
  errorCode: string | null;
}

/**
 * SPEC-014 §"Comportamento": passos 6/7 — grava as ofertas elegíveis e marca
 * o resultado final numa única transação. Nesta fatia só `SUCCEEDED`/`FAILED`
 * são alcançáveis (busca síncrona, sem resultado parcial real).
 */
export async function completeFlightSearch(
  tx: Prisma.TransactionClient,
  input: CompleteFlightSearchInput,
): Promise<FlightSearch> {
  if (input.offers.length > 0) {
    await tx.flightSearchOffer.createMany({
      data: input.offers.map((offer) => ({ ...offer, flightSearchId: input.flightSearchId })),
    });
  }
  return tx.flightSearch.update({
    where: { id: input.flightSearchId },
    data: {
      status: input.status,
      offersReturnedCount: input.offersReturnedCount,
      offersEligibleCount: input.offersEligibleCount,
      errorCode: input.errorCode,
    },
  });
}

export type FlightSearchWithOffers = FlightSearch & { offers: FlightSearchOffer[] };

/** SPEC-014 §"Contrato de API": `GET /v1/searches/flights/:id`. */
export async function getFlightSearchWithOffers(
  prisma: PrismaClient,
  flightSearchId: string,
): Promise<FlightSearchWithOffers | null> {
  return prisma.flightSearch.findUnique({
    where: { id: flightSearchId },
    include: { offers: true },
  });
}

export interface FlightSearchOfferForDerive {
  offer: FlightSearchOffer;
  flightSearch: FlightSearch;
}

/** SPEC-014 §"Comportamento": passo 1 de `POST /v1/offers/:id/watch`. */
export async function getFlightSearchOfferForDerive(
  prisma: PrismaClient,
  offerId: string,
): Promise<FlightSearchOfferForDerive | null> {
  const offer = await prisma.flightSearchOffer.findUnique({
    where: { id: offerId },
    include: { flightSearch: true },
  });
  if (!offer) {
    return null;
  }
  const { flightSearch, ...rest } = offer;
  return { offer: rest, flightSearch };
}
