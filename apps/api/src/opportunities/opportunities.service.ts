import { Injectable } from '@nestjs/common';
import type { DealClassification, FlightOffer } from '@flight-watch/domain';
import {
  classifyDeal,
  offerConnectionsCount,
  offerDurationMinutes,
  parseStoredItinerary,
  resolveCurrentOfferStatus,
  resolvePurchaseUrl,
  storedItineraryAsOffer,
} from '@flight-watch/domain';
import {
  findLatestObservationForSearchTarget,
  findLowestEverObservation,
  listCandidateSearchTargetsForOpportunities,
  summarizeObservationStats,
  type LatestObservationForOpportunity,
  type OpportunityCandidateSearchTarget,
} from '@flight-watch/database';
import { withAffiliateTracking } from '../affiliate/affiliate-links.js';
import type {
  ListOpportunitiesQuery,
  ListOpportunitiesResponse,
  OpportunityItem,
} from '@flight-watch/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PlacesService } from '../places/places.service.js';

/** SPEC-015 §"Comportamento de domínio": string em português, só existe aqui
 * — não no domínio (locale-independente) nem no frontend (resposta pública
 * já precisa carregar o texto pronto). */
function explainDeal(classification: DealClassification): string {
  if (classification.dealType === 'HISTORICAL_LOW') {
    return 'Menor preço já observado para esta rota.';
  }
  if (
    classification.dealType === 'PERCENTAGE_BELOW_REFERENCE' &&
    classification.dropPercent !== null
  ) {
    const roundedPercent = Math.round(classification.dropPercent);
    return `${roundedPercent}% abaixo da média observada para esta rota.`;
  }
  return '';
}

/** Sem nomes/coordenadas: o serviço completa em lote (SPEC-029). */
type OpportunityItemBase = Omit<
  OpportunityItem,
  'originName' | 'destinationName' | 'originCoordinates' | 'destinationCoordinates'
>;

function sortOpportunities(
  items: OpportunityItemBase[],
  sort: ListOpportunitiesQuery['sort'],
): void {
  switch (sort) {
    case 'lowest_price':
      items.sort((a, b) => a.offer.amountMinor - b.offer.amountMinor);
      break;
    case 'most_recent':
      items.sort((a, b) => (a.offer.observedAt < b.offer.observedAt ? 1 : -1));
      break;
    case 'shortest_duration':
      // SPEC-030: resumo sem duração conhecida vai para o fim.
      items.sort(
        (a, b) =>
          (a.offer.durationMinutes ?? Number.POSITIVE_INFINITY) -
          (b.offer.durationMinutes ?? Number.POSITIVE_INFINITY),
      );
      break;
    case 'best_value':
    default:
      // Maior queda percentual primeiro; HISTORICAL_LOW (dropPercent null)
      // é sempre a classificação mais forte, então vem antes de qualquer
      // PERCENTAGE_BELOW_REFERENCE.
      items.sort((a, b) => {
        if (a.deal.dealType === 'HISTORICAL_LOW' && b.deal.dealType !== 'HISTORICAL_LOW') return -1;
        if (b.deal.dealType === 'HISTORICAL_LOW' && a.deal.dealType !== 'HISTORICAL_LOW') return 1;
        return (b.deal.dropPercent ?? 0) - (a.deal.dropPercent ?? 0);
      });
  }
}

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly places: PlacesService,
  ) {}

  /** SPEC-015 §"Comportamento de domínio": ver a spec pra o raciocínio completo do scan em 2 passos. */
  async listOpportunities(query: ListOpportunitiesQuery): Promise<ListOpportunitiesResponse> {
    // SPEC-029: filtro por aeroporto (GRU) também acha a cidade dele (SAO), e
    // o código digitado continua valendo para alvos gravados antes da spec.
    const [originCodes, destinationCodes] = await Promise.all([
      this.filterCodes(query.origin),
      this.filterCodes(query.destination),
    ]);
    const asOf = new Date();
    const candidates = await listCandidateSearchTargetsForOpportunities(this.prisma.client, {
      asOf,
    });
    const filteredCandidates = candidates.filter((candidate) =>
      this.matchesTargetFilters(candidate, query, originCodes, destinationCodes),
    );

    const stats = await summarizeObservationStats(
      this.prisma.client,
      filteredCandidates.map((candidate) => candidate.id),
    );

    const items: OpportunityItemBase[] = [];
    for (const candidate of filteredCandidates) {
      const stat = stats.get(candidate.id);
      if (!stat) {
        continue;
      }

      const [lowestEver, latest] = await Promise.all([
        findLowestEverObservation(this.prisma.client, candidate.id),
        findLatestObservationForSearchTarget(this.prisma.client, candidate.id),
      ]);
      if (!lowestEver || !latest) {
        continue;
      }

      const item = this.buildOpportunityItem(candidate, latest, lowestEver, stat, query);
      if (item) {
        items.push(item);
        this.metrics.dealClassificationTotal.inc({ type: item.deal.dealType });
      }
    }

    sortOpportunities(items, query.sort);

    // SPEC-029: nomes e coordenadas numa consulta em lote, depois de ordenar.
    const opportunities = await this.places.withRouteNamesAndCoordinates(items);
    this.metrics.opportunitiesFeedFetchTotal.inc({ result: 'success' });
    return { opportunities, total: opportunities.length };
  }

  /** Código do filtro e a cidade dele no catálogo; null quando não há filtro. */
  private async filterCodes(code: string | undefined): Promise<Set<string> | null> {
    if (!code) return null;
    const city = await this.places.resolveCity(code);
    return new Set(city ? [code, city] : [code]);
  }

  private matchesTargetFilters(
    candidate: OpportunityCandidateSearchTarget,
    query: ListOpportunitiesQuery,
    originCodes: Set<string> | null,
    destinationCodes: Set<string> | null,
  ): boolean {
    if (originCodes && !originCodes.has(candidate.originIata)) return false;
    if (destinationCodes && !destinationCodes.has(candidate.destinationIata)) return false;
    if (query.tripType && candidate.tripType !== query.tripType) return false;
    if (query.departureDateFrom && candidate.departureDate < new Date(query.departureDateFrom)) {
      return false;
    }
    if (query.departureDateTo && candidate.departureDate > new Date(query.departureDateTo)) {
      return false;
    }
    return true;
  }

  private buildOpportunityItem(
    candidate: OpportunityCandidateSearchTarget,
    latest: LatestObservationForOpportunity,
    lowestEver: { totalAmountMinor: number; currency: string },
    stat: { observationCount: number; averageAmountMinor: number },
    query: ListOpportunitiesQuery,
  ): OpportunityItemBase | null {
    const classification = classifyDeal({
      currentAmount: { amountMinor: latest.totalAmountMinor, currency: latest.currency },
      lowestEverAmount: { amountMinor: lowestEver.totalAmountMinor, currency: lowestEver.currency },
      averageAmount: { amountMinor: stat.averageAmountMinor, currency: latest.currency },
      observationCount: stat.observationCount,
    });
    if (!classification.dealType) {
      return null;
    }
    if (query.dealType && classification.dealType !== query.dealType) {
      return null;
    }
    if (query.maxPriceMinor !== undefined && latest.totalAmountMinor > query.maxPriceMinor) {
      return null;
    }

    // SPEC-030: o itinerário gravado é lido pelo domínio (trechos ou resumo).
    const itinerary = parseStoredItinerary(latest.itinerary);
    const asFlightOffer = storedItineraryAsOffer(itinerary) as FlightOffer;
    const connectionsCount = offerConnectionsCount(asFlightOffer);
    if (query.maxStops !== undefined && connectionsCount > query.maxStops) {
      return null;
    }
    const durationMinutes = offerDurationMinutes(asFlightOffer);

    return {
      searchTargetId: candidate.id,
      origin: candidate.originIata,
      destination: candidate.destinationIata,
      tripType: candidate.tripType,
      market: candidate.market,
      departureDate: candidate.departureDate.toISOString().slice(0, 10),
      returnDate: candidate.returnDate ? candidate.returnDate.toISOString().slice(0, 10) : null,
      deal: {
        dealType: classification.dealType,
        referenceAmountMinor:
          classification.referenceAmount?.amountMinor ?? latest.totalAmountMinor,
        currentAmountMinor: latest.totalAmountMinor,
        currency: latest.currency,
        dropPercent: classification.dropPercent,
        confidence: classification.confidence,
        observationCount: stat.observationCount,
        explanation: explainDeal(classification),
        validFrom: latest.observedAt.toISOString(),
        validUntil: latest.expiresAt ? latest.expiresAt.toISOString() : null,
      },
      offer: {
        amountMinor: latest.totalAmountMinor,
        currency: latest.currency,
        purchaseUrl: withAffiliateTracking(
          resolvePurchaseUrl(latest.deeplink, latest.providerStrategy),
          latest.providerStrategy,
          'OPPORTUNITY',
        ),
        provider: latest.providerStrategy,
        observedAt: latest.observedAt.toISOString(),
        expiresAt: latest.expiresAt ? latest.expiresAt.toISOString() : null,
        status: resolveCurrentOfferStatus(latest.expiresAt),
        segments: itinerary.kind === 'SEGMENTS' ? itinerary.segments : [],
        fareSummary:
          itinerary.kind === 'FARE_SUMMARY'
            ? {
                departureDate: itinerary.summary.departureDate,
                returnDate: itinerary.summary.returnDate,
                stops: itinerary.summary.stops,
                durationMinutes: itinerary.summary.durationMinutes,
              }
            : null,
        durationMinutes,
        connectionsCount,
      },
    };
  }
}
