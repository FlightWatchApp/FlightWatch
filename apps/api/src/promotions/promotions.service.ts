import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  type ListPromotionsQuery,
  type ListPromotionsResponse,
  PROMOTION_CURRENCY,
  PROMOTION_MARKET,
  promotionItemSchema,
  SearchError,
} from '@flight-watch/contracts';
import {
  evaluatePromotion,
  invalidPriceReason,
  type PromotionPolicy,
  type PromotionPrice,
  promotionFreshness,
  promotionScope,
  referenceMonths,
  resolvePurchaseUrl,
} from '@flight-watch/domain';
import type { SearchableCity } from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import { type DestinationFare, type FlightProvider, ProviderError } from '@flight-watch/providers';
import { withAffiliateTracking } from '../affiliate/affiliate-links.js';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PlacesService } from '../places/places.service.js';
import { PriceCalendarCache } from '../pricing-source/price-calendar-cache.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '../pricing-source/key-value-store.js';
import { DailyCallBudget, ProviderCooldown } from '../pricing-source/provider-guard.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';
import { explainPromotion } from './promotion-explanation.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Feed vencido continua guardado mais 72 h: serve de reserva se a fonte falhar. */
const STALE_FEED_RETENTION_MS = 72 * 60 * MINUTE_MS;
/** Candidatos avaliados em paralelo; cada um consulta até 3 meses em sequência. */
const CANDIDATE_CONCURRENCY = 4;

/** O que fica no cache: tudo menos o link, montado na leitura (afiliado pode mudar). */
const storedPromotionSchema = promotionItemSchema.omit({ purchaseUrl: true });
type StoredPromotion = z.infer<typeof storedPromotionSchema>;
const storedFeedSchema = z.object({
  generatedAt: z.string(),
  promotions: z.array(storedPromotionSchema),
});
type StoredFeed = z.infer<typeof storedFeedSchema>;

type CacheLabel = 'hit' | 'miss' | 'stale' | 'none';
type TripType = ListPromotionsQuery['tripType'];

interface FeedOutcome {
  status: 'OK' | 'BUDGET_EXHAUSTED';
  generatedAt: string;
  promotions: StoredPromotion[];
  cache: CacheLabel;
}

/** A chamada não foi feita: orçamento do dia esgotado ou Retry-After em curso. */
class CallRefused extends Error {
  constructor(readonly reason: 'budget_exhausted' | 'rate_limited') {
    super(`promotion provider call refused: ${reason}`);
  }
}

interface RoundState {
  calls: number;
  /** Alguma chamada foi recusada (orçamento ou Retry-After): rodada incompleta. */
  refused: boolean;
  budgetRefused: boolean;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function toPrice(fare: DestinationFare): PromotionPrice {
  return {
    departureDate: fare.departureDate,
    amountMinor: fare.amountMinor,
    currency: PROMOTION_CURRENCY,
    observedAt: fare.observedAt,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * SPEC-032 — promoções por origem, calculadas sob demanda e guardadas só em
 * cache reconstruível (D1). Regra de ouro: não chamar a fonte se já sabemos.
 *
 * Fluxo: cache fresco da origem → responde. Senão, uma chamada de candidatos
 * (mais barato por destino), os N mais baratos válidos e pesquisáveis, e para
 * cada um os preços da rota no mês da data e vizinhos (cache por rota-mês,
 * o mesmo do calendário) avaliados pela função pura do domínio.
 */
@Injectable()
export class PromotionsService {
  private readonly policy: PromotionPolicy;
  private readonly feedTtlMs: number;
  /** Single-flight: requisições simultâneas da mesma origem fria, um cálculo. */
  private readonly inflight = new Map<string, Promise<FeedOutcome>>();
  /** Orçamento diário só do feed (SPEC-032); o Retry-After é compartilhado. */
  private readonly budget: DailyCallBudget;

  constructor(
    @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider,
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly calendar: PriceCalendarCache,
    private readonly places: PlacesService,
    private readonly metrics: MetricsService,
    private readonly cooldown: ProviderCooldown,
  ) {
    this.budget = new DailyCallBudget(store, {
      keyPrefix: 'promotions:budget:v1',
      limit: config.PROMOTION_DAILY_CALL_BUDGET,
      exhaustedEvent: 'promotion_budget_exhausted',
      onRemaining: (remaining) => metrics.promotionBudgetRemaining.set(remaining),
    });
    this.policy = {
      minReferencePoints: config.PROMOTION_MIN_REFERENCE_POINTS,
      minDomesticDiscountBps: config.PROMOTION_MIN_DOMESTIC_DISCOUNT_BPS,
      minInternationalDiscountBps: config.PROMOTION_MIN_INTERNATIONAL_DISCOUNT_BPS,
      suspectDiscountBps: config.PROMOTION_SUSPECT_DISCOUNT_BPS,
      savingScoreCapMinor: config.PROMOTION_SAVING_SCORE_CAP_MINOR,
    };
    this.feedTtlMs = config.PROMOTION_FEED_CACHE_TTL_MINUTES * MINUTE_MS;
  }

  async list(query: ListPromotionsQuery): Promise<ListPromotionsResponse> {
    const startedAt = Date.now();
    const originCode = await this.places.resolveCity(query.origin);
    const origin = originCode
      ? (await this.places.searchableCities([originCode])).get(originCode)
      : undefined;
    if (!origin) {
      throw new SearchError('UNSUPPORTED_SEARCH', 'origin not supported');
    }

    if (!this.config.PROMOTION_ENGINE_ENABLED) {
      this.record('none', 'disabled', startedAt);
      return {
        origin: origin.code,
        originName: origin.name,
        status: 'DISABLED',
        generatedAt: new Date().toISOString(),
        promotions: [],
      };
    }

    let outcome: FeedOutcome;
    try {
      outcome = await this.feed(origin, query.tripType);
    } catch (error) {
      if (error instanceof SearchError && error.errorCode === 'PROVIDER_UNAVAILABLE') {
        this.record('miss', 'provider_unavailable', startedAt);
      }
      throw error;
    }
    this.record(outcome.cache, outcome.status === 'OK' ? 'ok' : 'budget_exhausted', startedAt);

    const now = new Date();
    const promotions = outcome.promotions
      // Idade pela hora em que a fonte viu o preço: mais de 72 h sai do feed.
      .filter((promotion) => promotionFreshness(promotion.observedAt, now) !== 'EXPIRED')
      .filter(
        (promotion) =>
          query.scope === 'all' ||
          (query.scope === 'domestic') === (promotion.scope === 'DOMESTIC'),
      )
      .sort(comparator(query.sort))
      .slice(0, query.limit)
      .map((promotion) => ({
        ...promotion,
        purchaseUrl: this.purchaseUrl(origin.code, promotion),
      }));

    return {
      origin: origin.code,
      originName: origin.name,
      status: outcome.status,
      generatedAt: outcome.generatedAt,
      promotions,
    };
  }

  /**
   * SPEC-033: promoção da rota **só do feed já em cache** da origem — nunca
   * dispara o cálculo (a página da rota não consome o orçamento do feed).
   * Vencida pelo TTL ainda vale; preço com mais de 72 h, não.
   */
  async cachedPromotion(
    origin: string,
    destination: string,
    tripType: TripType,
  ): Promise<StoredPromotion | null> {
    if (!this.config.PROMOTION_ENGINE_ENABLED) return null;
    const feed = await this.readFeed(feedKey(origin, tripType));
    const promotion = feed?.promotions.find((item) => item.destination === destination);
    if (!promotion || promotionFreshness(promotion.observedAt, new Date()) === 'EXPIRED') {
      return null;
    }
    return promotion;
  }

  private record(cache: CacheLabel, result: string, startedAt: number): void {
    this.metrics.promotionFeedRequestsTotal.inc({ cache, result });
    this.metrics.promotionFeedDurationSeconds.observe({ cache }, (Date.now() - startedAt) / 1000);
  }

  private async feed(origin: SearchableCity, tripType: TripType): Promise<FeedOutcome> {
    const key = feedKey(origin.code, tripType);
    const cached = await this.readFeed(key);
    if (cached && Date.now() - Date.parse(cached.generatedAt) < this.feedTtlMs) {
      return { ...cached, status: 'OK', cache: 'hit' };
    }
    const running = this.inflight.get(key);
    if (running) {
      return running;
    }
    const computation = this.compute(origin, tripType, key, cached).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, computation);
    return computation;
  }

  private async compute(
    origin: SearchableCity,
    tripType: TripType,
    key: string,
    stale: StoredFeed | null,
  ): Promise<FeedOutcome> {
    const startedAt = Date.now();
    const now = new Date();
    const round: RoundState = { calls: 0, refused: false, budgetRefused: false };
    const fallback = (): FeedOutcome | null =>
      stale ? { ...stale, status: 'OK', cache: 'stale' } : null;

    if (!this.provider.cheapestByDestination) {
      // Provedor sem a capacidade: feed vazio, sem erro.
      return { status: 'OK', generatedAt: now.toISOString(), promotions: [], cache: 'miss' };
    }

    let fares: DestinationFare[];
    try {
      await this.beforeCall(round);
      fares = await this.provider.cheapestByDestination({
        originIata: origin.code,
        tripType,
        currency: PROMOTION_CURRENCY,
        market: PROMOTION_MARKET,
      });
      this.metrics.promotionProviderCallsTotal.inc({ kind: 'candidates', result: 'ok' });
    } catch (error) {
      if (error instanceof CallRefused) {
        this.metrics.promotionProviderCallsTotal.inc({ kind: 'candidates', result: error.reason });
        const served = fallback();
        if (served) return served;
        if (error.reason === 'budget_exhausted') {
          return {
            status: 'BUDGET_EXHAUSTED',
            generatedAt: now.toISOString(),
            promotions: [],
            cache: 'miss',
          };
        }
        throw new SearchError('PROVIDER_UNAVAILABLE', 'promotion source rate limited');
      }
      if (error instanceof ProviderError) {
        this.metrics.promotionProviderCallsTotal.inc({
          kind: 'candidates',
          result: await this.noteProviderError(error),
        });
        logEvent({
          event: 'promotion_provider_error',
          kind: 'candidates',
          errorClass: error.errorClass,
        });
        const served = fallback();
        if (served) return served;
        throw new SearchError('PROVIDER_UNAVAILABLE', 'promotion source unavailable');
      }
      throw error;
    }

    const valid = fares.filter(
      (fare) =>
        fare.destinationIata !== origin.code &&
        invalidPriceReason(toPrice(fare), PROMOTION_CURRENCY, now) === null,
    );
    const cities = await this.places.searchableCities(valid.map((fare) => fare.destinationIata));
    const candidates = valid
      .filter((fare) => cities.has(fare.destinationIata))
      .sort((a, b) => a.amountMinor - b.amountMinor)
      .slice(0, this.config.PROMOTION_CANDIDATES_PER_ORIGIN);

    const evaluated = await mapWithConcurrency(candidates, CANDIDATE_CONCURRENCY, (fare) =>
      this.evaluateCandidate(
        origin,
        cities.get(fare.destinationIata) as SearchableCity,
        fare,
        tripType,
        now,
        round,
      ),
    );
    const promotions = evaluated.filter((item): item is StoredPromotion => item !== null);
    const generatedAt = now.toISOString();

    if (round.refused && promotions.length === 0) {
      const served = fallback();
      if (served) return served;
    }
    // Rodada incompleta (orçamento ou Retry-After) não fica no cache: a
    // próxima tenta de novo, e os meses já consultados estão no cache por rota.
    if (!round.refused) {
      await this.writeFeed(key, { generatedAt, promotions });
    }

    logEvent({
      event: 'promotion_feed_computed',
      origin: origin.code,
      tripType,
      candidates: candidates.length,
      qualified: promotions.length,
      calls: round.calls,
      durationMs: Date.now() - startedAt,
    });
    const exhausted = round.budgetRefused && promotions.length === 0;
    return {
      status: exhausted ? 'BUDGET_EXHAUSTED' : 'OK',
      generatedAt,
      promotions,
      cache: 'miss',
    };
  }

  private async evaluateCandidate(
    origin: SearchableCity,
    destination: SearchableCity,
    fare: DestinationFare,
    tripType: TripType,
    now: Date,
    round: RoundState,
  ): Promise<StoredPromotion | null> {
    // Ida e volta: só datas com a mesma duração (regra da SPEC-031).
    const tripLengthDays = fare.returnDate
      ? daysBetween(fare.departureDate, fare.returnDate)
      : null;
    const months = referenceMonths(fare.departureDate, now);
    const referencePrices: PromotionPrice[] = [];

    for (const month of months) {
      try {
        const result = await this.calendar.get(
          {
            originIata: origin.code,
            destinationIata: destination.code,
            month,
            tripType,
            tripLengthDays,
            currency: PROMOTION_CURRENCY,
            market: PROMOTION_MARKET,
          },
          { beforeFetch: () => this.beforeCall(round) },
        );
        if (!result) return null; // provedor sem calendário: nada a comparar
        this.metrics.promotionProviderCallsTotal.inc({
          kind: 'month',
          result: result.fromCache ? 'cache_hit' : 'ok',
        });
        for (const day of result.days) {
          referencePrices.push({
            departureDate: day.date,
            amountMinor: day.amountMinor,
            currency: PROMOTION_CURRENCY,
            observedAt: day.observedAt,
          });
        }
      } catch (error) {
        // Erro num mês: o candidato sai desta rodada; os outros seguem.
        if (error instanceof CallRefused) {
          round.refused = true;
          this.metrics.promotionProviderCallsTotal.inc({ kind: 'month', result: error.reason });
          return null;
        }
        if (error instanceof ProviderError) {
          this.metrics.promotionProviderCallsTotal.inc({
            kind: 'month',
            result: await this.noteProviderError(error),
          });
          logEvent({
            event: 'promotion_provider_error',
            kind: 'month',
            errorClass: error.errorClass,
          });
          return null;
        }
        throw error;
      }
    }

    const scope = promotionScope(origin.countryCode, destination.countryCode);
    const evaluation = evaluatePromotion(
      { candidate: toPrice(fare), currency: PROMOTION_CURRENCY, scope, referencePrices },
      this.policy,
      now,
    );
    this.metrics.promotionEvaluationsTotal.inc({ result: evaluation.result.toLowerCase() });

    if (evaluation.result === 'SUSPECT') {
      // Nunca no feed: consultar a mesma fonte de novo devolve o mesmo cache.
      logEvent({
        event: 'promotion_suspect_detected',
        // "destination" é campo redigido no logger (contato); a rota vai inteira.
        route: `${origin.code}-${destination.code}`,
        departureDate: fare.departureDate,
        discountBps: evaluation.discountBps,
      });
      return null;
    }
    if (evaluation.result !== 'QUALIFIES') {
      return null;
    }

    const { promotion } = evaluation;
    return {
      destination: destination.code,
      destinationName: destination.name,
      destinationCoordinates:
        destination.latitude !== null && destination.longitude !== null
          ? { latitude: destination.latitude, longitude: destination.longitude }
          : null,
      scope,
      tripType,
      departureDate: fare.departureDate,
      returnDate: fare.returnDate,
      price: { amountMinor: fare.amountMinor, currency: PROMOTION_CURRENCY },
      stops: fare.stops,
      discountBps: promotion.discountBps,
      absoluteSavingMinor: promotion.absoluteSavingMinor,
      reference: {
        amountMinor: promotion.referenceAmountMinor,
        pointCount: promotion.referencePointCount,
        months: promotion.referenceMonths,
        explanation: explainPromotion({
          amountMinor: fare.amountMinor,
          currency: PROMOTION_CURRENCY,
          discountBps: promotion.discountBps,
          referencePointCount: promotion.referencePointCount,
          originName: origin.name,
          destinationName: destination.name,
          months: promotion.referenceMonths,
        }),
      },
      observedAt: fare.observedAt,
      score: promotion.score,
      scoreVersion: promotion.scoreVersion,
    };
  }

  /** Link pela allowlist (SPEC-018) e com afiliado na superfície OPPORTUNITY (SPEC-020). */
  private purchaseUrl(origin: string, promotion: StoredPromotion): string | null {
    const raw = this.provider.allFlightsUrl?.({
      originIata: origin,
      destinationIata: promotion.destination,
      departureDate: promotion.departureDate,
      returnDate: promotion.returnDate,
      tripType: promotion.tripType,
      cabin: 'ECONOMY',
      adults: 1,
      currency: promotion.price.currency,
      market: PROMOTION_MARKET,
    });
    return withAffiliateTracking(
      resolvePurchaseUrl(raw ?? null, this.provider.strategy),
      this.provider.strategy,
      'OPPORTUNITY',
    );
  }

  // --- orçamento e Retry-After -------------------------------------------

  /** Antes de toda chamada do feed à fonte (nunca num acerto de cache). */
  private async beforeCall(round: RoundState): Promise<void> {
    if (await this.cooldown.active()) {
      round.refused = true;
      throw new CallRefused('rate_limited');
    }
    if (!(await this.budget.reserve())) {
      round.refused = true;
      round.budgetRefused = true;
      throw new CallRefused('budget_exhausted');
    }
    round.calls += 1;
  }

  /** Devolve o rótulo da métrica; 429 suspende as chamadas à fonte até o Retry-After. */
  private noteProviderError(error: ProviderError): Promise<'error' | 'rate_limited'> {
    return this.cooldown.note(error, 'promotion_provider_rate_limited');
  }

  // --- cache do feed ---------------------------------------------------------

  private async readFeed(key: string): Promise<StoredFeed | null> {
    try {
      const raw = await this.store.get(key);
      if (raw === null) return null;
      const parsed = storedFeedSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // Redis fora ou valor corrompido = sem cache
    }
  }

  private async writeFeed(key: string, feed: StoredFeed): Promise<void> {
    try {
      await this.store.set(key, JSON.stringify(feed), this.feedTtlMs + STALE_FEED_RETENTION_MS);
    } catch {
      // Redis fora: calculado sem cache.
    }
  }
}

function feedKey(origin: string, tripType: TripType): string {
  return `promotions:v1:${origin}:${tripType}:${PROMOTION_CURRENCY}:${PROMOTION_MARKET}`;
}

function comparator(
  sort: ListPromotionsQuery['sort'],
): (a: StoredPromotion, b: StoredPromotion) => number {
  switch (sort) {
    case 'price':
      return (a, b) => a.price.amountMinor - b.price.amountMinor || b.score - a.score;
    case 'discount':
      return (a, b) => b.discountBps - a.discountBps || a.price.amountMinor - b.price.amountMinor;
    case 'score':
    default:
      return (a, b) => b.score - a.score || b.discountBps - a.discountBps;
  }
}
