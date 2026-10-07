import { Inject, Injectable } from '@nestjs/common';
import {
  type CreateFlightSearchRequest,
  type DeriveWatchFromOfferRequest,
  type FlightSearchOffer as FlightSearchOfferView,
  type FlightSearchResponse,
  type FareSummaryView,
  type PriceCalendarQuery,
  type PriceCalendarResponse,
  CreateWatchError,
  DeriveWatchError,
  SearchError,
  type CreateWatchResponse,
} from '@flight-watch/contracts';
import {
  buildOfferSignature,
  computeObservationKey,
  computeObservedAtBucket,
  isOfferEligible,
  offerConnectionsCount,
  offerDurationMinutes,
  OFFER_SELECTION_POLICY_VERSION,
  parseStoredItinerary,
  resolveCurrentOfferStatus,
  resolvePurchaseUrl,
  storedItineraryAsOffer,
  toStoredItinerary,
  type FareSummary,
  type FlightOffer,
} from '@flight-watch/domain';
import type { FlightSearch, FlightSearchOffer, Prisma } from '@flight-watch/database';
import {
  claimSearchExecutionForRunning,
  completeFlightSearch,
  createPendingFlightSearch,
  getFlightSearchOfferForDerive,
  getFlightSearchWithOffers,
  isUniqueConstraintViolation,
  persistPriceObservationSuccess,
} from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import { withAffiliateTracking } from '../affiliate/affiliate-links.js';
import { ProviderError, type FlightProvider } from '@flight-watch/providers';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { WatchesService } from '../watches/watches.service.js';
import { PlacesService } from '../places/places.service.js';
import { isSupportedCurrencyAndMarket } from '../watches/supported-catalog.js';
import { FLIGHT_PROVIDER } from './flight-provider.token.js';

// SPEC-014: mesma normalização/seleção que o pipeline de monitoramento usa
// (apps/price-worker), mas não dá pra importar a constante privada de outro
// app — versão replicada deliberadamente, muda só com decisão explícita.
const DISCOVERY_NORMALIZER_VERSION = 1;

@Injectable()
export class SearchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly watchesService: WatchesService,
    @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider,
    private readonly places: PlacesService,
  ) {}

  /**
   * SPEC-014 §"Comportamento de domínio e invariantes". SPEC-029: origem e
   * destino viram cidade do catálogo antes de qualquer outra regra.
   */
  async searchFlights(
    userId: string | null,
    rawRequest: CreateFlightSearchRequest,
    correlationId: string,
  ): Promise<FlightSearchResponse> {
    const [origin, destination] = await Promise.all([
      this.places.resolveCity(rawRequest.origin),
      this.places.resolveCity(rawRequest.destination),
    ]);
    if (
      !origin ||
      !destination ||
      origin === destination ||
      !isSupportedCurrencyAndMarket(rawRequest)
    ) {
      throw new SearchError('UNSUPPORTED_SEARCH', 'route, currency or market not supported');
    }
    const base = await this.runSearch(
      userId,
      { ...rawRequest, origin, destination },
      correlationId,
    );
    return this.withNames(base);
  }

  private async withNames(base: FlightSearchResponseBase): Promise<FlightSearchResponse> {
    const [named] = await this.places.withRouteNames([base]);
    if (!named) {
      throw new SearchError('FLIGHT_SEARCH_NOT_FOUND', 'flight search not found');
    }
    return { ...named, allFlightsUrl: this.allFlightsUrlFor(base) };
  }

  /**
   * SPEC-031: "ver todos os voos" no site parceiro, pela allowlist (SPEC-018)
   * e com afiliado (SPEC-020); null quando o provedor não oferece.
   */
  private allFlightsUrlFor(search: FlightSearchResponseBase): string | null {
    const raw = this.provider.allFlightsUrl?.({
      originIata: search.origin,
      destinationIata: search.destination,
      departureDate: search.departureDate,
      returnDate: search.returnDate,
      tripType: search.tripType,
      cabin: search.cabin,
      adults: search.adults,
      currency: search.currency,
      market: search.market,
    });
    return withAffiliateTracking(
      resolvePurchaseUrl(raw ?? null, this.provider.strategy),
      this.provider.strategy,
      'SEARCH',
    );
  }

  /** SPEC-031: menor preço por dia do mês, por cidade (SPEC-029). */
  async getPriceCalendar(query: PriceCalendarQuery): Promise<PriceCalendarResponse> {
    const [origin, destination] = await Promise.all([
      this.places.resolveCity(query.origin),
      this.places.resolveCity(query.destination),
    ]);
    if (!origin || !destination || origin === destination || !isSupportedCurrencyAndMarket(query)) {
      throw new SearchError('UNSUPPORTED_SEARCH', 'route, currency or market not supported');
    }
    if (!this.provider.priceCalendar) {
      this.metrics.priceCalendarFetchTotal.inc({ result: 'not_supported' });
      return { origin, destination, month: query.month, currency: query.currency, days: [] };
    }
    try {
      const days = await this.provider.priceCalendar({
        originIata: origin,
        destinationIata: destination,
        month: query.month,
        tripType: query.tripType,
        tripLengthDays: query.tripLengthDays ?? null,
        currency: query.currency,
      });
      this.metrics.priceCalendarFetchTotal.inc({ result: days.length > 0 ? 'success' : 'empty' });
      return { origin, destination, month: query.month, currency: query.currency, days };
    } catch (error) {
      if (error instanceof ProviderError) {
        this.metrics.priceCalendarFetchTotal.inc({ result: 'provider_error' });
        logEvent({ event: 'price_calendar_provider_error', errorClass: error.errorClass });
        throw new SearchError('PROVIDER_UNAVAILABLE', 'price calendar source unavailable');
      }
      throw error;
    }
  }

  private async runSearch(
    userId: string | null,
    request: CreateFlightSearchRequest,
    correlationId: string,
  ): Promise<FlightSearchResponseBase> {
    const flightSearch = await createPendingFlightSearch(this.prisma.client, {
      userId,
      originIata: request.origin,
      destinationIata: request.destination,
      departureDate: request.departureDate,
      returnDate: request.returnDate,
      tripType: request.tripType,
      cabin: request.cabin,
      adults: request.adults,
      currency: request.currency,
      market: request.market,
      maxStops: request.maxStops,
      maxPriceMinor: request.maxPriceMinor,
      correlationId,
    });

    // SPEC-014: nunca segura uma transação do Postgres durante I/O externo —
    // mesma regra de apps/price-worker/src/process-job.ts.
    const stopTimer = this.metrics.flightSearchDurationSeconds.startTimer({
      provider: this.provider.strategy,
    });
    try {
      const result = await this.provider.search(
        {
          originIata: request.origin,
          destinationIata: request.destination,
          departureDate: request.departureDate,
          returnDate: request.returnDate,
          tripType: request.tripType,
          cabin: request.cabin,
          adults: request.adults,
          currency: request.currency,
          market: request.market,
        },
        // SPEC-014: reaproveita ProviderContext.searchExecutionId com o
        // FlightSearch.id — não existe SearchExecution no caminho de
        // descoberta, e a porta não precisa de um segundo campo equivalente
        // só para este chamador.
        { correlationId, searchExecutionId: flightSearch.id },
      );
      stopTimer();

      const offers = result.kind === 'offers' ? result.offers : [];
      const eligible = offers.filter((offer) =>
        isOfferEligible(offer, {
          originIata: request.origin,
          destinationIata: request.destination,
          currency: request.currency,
          adults: request.adults,
          departureDate: request.departureDate,
          returnDate: request.returnDate,
        }),
      );
      const filtered = eligible.filter(
        (offer) =>
          (request.maxStops === null || offerConnectionsCount(offer) <= request.maxStops) &&
          (request.maxPriceMinor === null || offer.totalAmountMinor <= request.maxPriceMinor),
      );

      const insertOffers = filtered.map((offer) =>
        toOfferInsertInput(offer, this.provider.strategy),
      );
      await this.prisma.client.$transaction((tx) =>
        completeFlightSearch(tx, {
          flightSearchId: flightSearch.id,
          status: 'SUCCEEDED',
          offers: insertOffers,
          offersReturnedCount: offers.length,
          offersEligibleCount: filtered.length,
          errorCode: null,
        }),
      );

      this.metrics.flightSearchTotal.inc({ result: 'succeeded', mode: 'sync' });
      this.metrics.flightOffersReturnedTotal.inc(
        { provider: this.provider.strategy },
        filtered.length,
      );
      logEvent({
        event: 'flight_search',
        flightSearchId: flightSearch.id,
        result: 'succeeded',
        offersCount: filtered.length,
        correlationId,
      });

      const persisted = await getFlightSearchWithOffers(this.prisma.client, flightSearch.id);
      if (!persisted) {
        throw new Error(
          `invariant violated: flight search ${flightSearch.id} vanished mid-request`,
        );
      }
      return toFlightSearchResponse(persisted);
    } catch (error) {
      stopTimer();
      if (error instanceof ProviderError) {
        await this.prisma.client.$transaction((tx) =>
          completeFlightSearch(tx, {
            flightSearchId: flightSearch.id,
            status: 'FAILED',
            offers: [],
            offersReturnedCount: 0,
            offersEligibleCount: 0,
            errorCode: error.errorClass,
          }),
        );
        this.metrics.flightSearchTotal.inc({ result: 'failed', mode: 'sync' });
        logEvent({
          event: 'flight_search',
          flightSearchId: flightSearch.id,
          result: 'failed',
          errorCode: error.errorClass,
          correlationId,
        });
        const persisted = await getFlightSearchWithOffers(this.prisma.client, flightSearch.id);
        if (!persisted) {
          throw new Error(
            `invariant violated: flight search ${flightSearch.id} vanished mid-request`,
          );
        }
        // SPEC-014 §"Decisão de design": falha do provider não é um erro
        // HTTP — o recurso FlightSearch foi criado de verdade e é
        // endereçável via GET .../:id; conflar "requisição falhou" com "a
        // busca não achou nada" violaria o próprio critério de aceitação
        // do rascunho.
        return toFlightSearchResponse(persisted);
      }
      throw error;
    }
  }

  /** SPEC-014 §"Contrato de API": `GET /v1/searches/flights/:id`. */
  async getFlightSearch(id: string): Promise<FlightSearchResponse> {
    return this.withNames(await this.findFlightSearch(id));
  }

  private async findFlightSearch(id: string): Promise<FlightSearchResponseBase> {
    const flightSearch = await getFlightSearchWithOffers(this.prisma.client, id);
    if (!flightSearch) {
      throw new SearchError('FLIGHT_SEARCH_NOT_FOUND', 'flight search not found');
    }
    return toFlightSearchResponse(flightSearch);
  }

  /** SPEC-014 §"Comportamento de domínio": `POST /v1/offers/:id/watch`. */
  async deriveWatchFromOffer(
    userId: string,
    offerId: string,
    body: DeriveWatchFromOfferRequest,
    idempotencyKey: string | undefined,
  ): Promise<CreateWatchResponse> {
    try {
      const response = await this.doDeriveWatchFromOffer(userId, offerId, body, idempotencyKey);
      this.metrics.flightOfferWatchDeriveTotal.inc({ result: 'success' });
      return response;
    } catch (error) {
      this.metrics.flightOfferWatchDeriveTotal.inc({ result: mapDeriveErrorToMetricResult(error) });
      throw error;
    }
  }

  private async doDeriveWatchFromOffer(
    userId: string,
    offerId: string,
    body: DeriveWatchFromOfferRequest,
    idempotencyKey: string | undefined,
  ): Promise<CreateWatchResponse> {
    const found = await getFlightSearchOfferForDerive(this.prisma.client, offerId);
    if (!found) {
      throw new DeriveWatchError('OFFER_NOT_FOUND', 'flight search offer not found');
    }
    const { offer, flightSearch } = found;

    if (resolveCurrentOfferStatus(offer.expiresAt) === 'EXPIRED') {
      throw new DeriveWatchError('OFFER_EXPIRED', 'flight search offer has expired');
    }

    const response = await this.watchesService.createWatch(
      userId,
      {
        origin: flightSearch.originIata,
        destination: flightSearch.destinationIata,
        tripType: flightSearch.tripType,
        departureDate: flightSearch.departureDate.toISOString().slice(0, 10),
        returnDate: flightSearch.returnDate
          ? flightSearch.returnDate.toISOString().slice(0, 10)
          : null,
        cabin: 'ECONOMY',
        adults: 1,
        currency: flightSearch.currency,
        market: flightSearch.market,
        alertRules: body.alertRules,
        notificationChannelId: body.notificationChannelId,
      },
      idempotencyKey,
    );

    const watch = await this.prisma.client.watch.findUniqueOrThrow({
      where: { id: response.id },
      include: { searchTarget: true },
    });
    await this.seedInitialObservation(watch.id, watch.searchTarget, offer, flightSearch);

    return response;
  }

  /**
   * SPEC-014 §"Idempotência e concorrência": popula o `currentOffer` do Watch
   * recém-criado a partir do snapshot da oferta que o usuário já viu — sem
   * uma segunda chamada ao provider. Reusa claimSearchExecutionForRunning +
   * persistPriceObservationSuccess como estão (packages/database), sem
   * função nova de repositório para "observação instantânea".
   *
   * Idempotente via `discovery-seed:${watchId}`: chamar depois de todo
   * createWatch() (inclusive num replay idempotente, que o retorno de
   * createWatch não distingue de uma criação nova) precisa ser seguro —
   * no replay, a constraint única de idempotencyKey colide e é tratada como
   * no-op silencioso.
   *
   * Corrida benigna, deliberadamente não corrigida: entre o commit de
   * createWatch() (que deixa o SearchTarget novo com nextCheckAt = now,
   * imediatamente elegível) e o commit desta transação, o scheduler poderia
   * em teoria pegar o mesmo target. Não corrompe nada —
   * persistPriceObservationSuccess dedupe por observationKey, cada caminho
   * tem sua própria SearchExecution/lease; na pior hipótese existem duas
   * observações e `ORDER BY observedAt DESC` (enrichWatch) já escolhe a
   * mais nova corretamente.
   */
  private async seedInitialObservation(
    watchId: string,
    searchTarget: { id: string; checkIntervalSeconds: number },
    offer: FlightSearchOffer,
    flightSearch: FlightSearch,
  ): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const execution = await tx.searchExecution.create({
          data: {
            searchTargetId: searchTarget.id,
            providerStrategy: offer.providerStrategy,
            status: 'SCHEDULED',
            idempotencyKey: `discovery-seed:${watchId}`,
            correlationId: flightSearch.correlationId,
          },
        });
        // Garantido non-null: a linha acabou de nascer SCHEDULED dentro
        // desta mesma transação, sem concorrente possível antes do commit.
        const claimed = await claimSearchExecutionForRunning(tx, execution.id);
        if (!claimed?.leaseToken) {
          throw new Error(`invariant violated: seeded execution ${execution.id} has no leaseToken`);
        }

        const observedAtBucket = computeObservedAtBucket(offer.observedAt);
        const observationKey = computeObservationKey({
          searchExecutionId: execution.id,
          offerSignature: offer.offerSignature,
          observedAtBucket,
          normalizerVersion: DISCOVERY_NORMALIZER_VERSION,
        });

        await persistPriceObservationSuccess(tx, {
          searchExecutionId: execution.id,
          leaseToken: claimed.leaseToken,
          searchTargetId: searchTarget.id,
          providerStrategy: offer.providerStrategy,
          correlationId: flightSearch.correlationId,
          observedAt: offer.observedAt,
          totalAmountMinor: offer.totalAmountMinor,
          currency: offer.currency,
          itinerary: offer.itinerary as Prisma.InputJsonValue,
          offerSignature: offer.offerSignature,
          deeplink: offer.deeplink,
          expiresAt: offer.expiresAt,
          qualityFlags: offer.qualityFlags,
          observationKey,
          selectionPolicyVersion: OFFER_SELECTION_POLICY_VERSION,
          normalizerVersion: DISCOVERY_NORMALIZER_VERSION,
          offersReceivedCount: 1,
          nextCheckAt: new Date(Date.now() + searchTarget.checkIntervalSeconds * 1000),
        });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'idempotencyKey')) {
        return;
      }
      throw error;
    }
  }
}

function mapDeriveErrorToMetricResult(error: unknown): string {
  if (error instanceof DeriveWatchError) {
    return error.errorCode.toLowerCase();
  }
  if (error instanceof CreateWatchError) {
    return error.errorCode.toLowerCase();
  }
  return 'internal_error';
}

function toOfferInsertInput(
  offer: FlightOffer,
  providerStrategy: string,
): {
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
} {
  return {
    providerStrategy,
    providerOfferId: offer.providerOfferId,
    totalAmountMinor: offer.totalAmountMinor,
    currency: offer.currency,
    passengerCount: offer.passengerCount,
    // SPEC-030: o domínio é dono do formato gravado (trechos ou resumo).
    itinerary: toStoredItinerary(offer) as Prisma.InputJsonValue,
    offerSignature: buildOfferSignature(offer),
    observedAt: new Date(offer.observedAt),
    expiresAt: offer.expiresAt ? new Date(offer.expiresAt) : null,
    deeplink: offer.deeplink ?? null,
    qualityFlags: offer.qualityFlags ?? [],
  };
}

/**
 * SPEC-030: o itinerário gravado é lido pelo domínio (trechos ou resumo de
 * tarifa); `segments` fica vazio para resumo.
 */
function toFlightSearchOfferView(
  row: FlightSearchOffer,
  searchId: string,
  cabin: string,
): FlightSearchOfferView {
  const itinerary = parseStoredItinerary(row.itinerary);
  const asFlightOffer = storedItineraryAsOffer(itinerary) as FlightOffer;
  return {
    id: row.id,
    searchId,
    provider: row.providerStrategy,
    segments: itinerary.kind === 'SEGMENTS' ? itinerary.segments : [],
    fareSummary: itinerary.kind === 'FARE_SUMMARY' ? toFareSummaryView(itinerary.summary) : null,
    totalAmountMinor: row.totalAmountMinor,
    currency: row.currency,
    passengerCount: row.passengerCount,
    cabin,
    durationMinutes: offerDurationMinutes(asFlightOffer),
    connectionsCount: offerConnectionsCount(asFlightOffer),
    observedAt: row.observedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    purchaseUrl: withAffiliateTracking(
      resolvePurchaseUrl(row.deeplink, row.providerStrategy),
      row.providerStrategy,
      'SEARCH',
    ),
    availabilityStatus: resolveCurrentOfferStatus(row.expiresAt),
    qualityFlags: row.qualityFlags,
  };
}

function toFareSummaryView(summary: FareSummary): FareSummaryView {
  return {
    departureDate: summary.departureDate,
    returnDate: summary.returnDate,
    stops: summary.stops,
    durationMinutes: summary.durationMinutes,
  };
}

/** Sem `originName`/`destinationName`: o serviço completa em lote (SPEC-029). */
type FlightSearchResponseBase = Omit<
  FlightSearchResponse,
  'originName' | 'destinationName' | 'allFlightsUrl'
>;

function toFlightSearchResponse(
  flightSearch: FlightSearch & { offers: FlightSearchOffer[] },
): FlightSearchResponseBase {
  return {
    id: flightSearch.id,
    status: flightSearch.status,
    origin: flightSearch.originIata,
    destination: flightSearch.destinationIata,
    tripType: flightSearch.tripType,
    departureDate: flightSearch.departureDate.toISOString().slice(0, 10),
    returnDate: flightSearch.returnDate ? flightSearch.returnDate.toISOString().slice(0, 10) : null,
    cabin: 'ECONOMY',
    adults: 1,
    currency: flightSearch.currency,
    market: flightSearch.market,
    errorCode: flightSearch.errorCode,
    createdAt: flightSearch.createdAt.toISOString(),
    expiresAt: flightSearch.expiresAt ? flightSearch.expiresAt.toISOString() : null,
    offers: flightSearch.offers.map((offer) =>
      toFlightSearchOfferView(offer, flightSearch.id, flightSearch.cabin),
    ),
  };
}
