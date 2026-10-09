import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  type GetRouteQuery,
  type GetRouteResponse,
  getRouteResponseSchema,
  type ListRoutesResponse,
  listRoutesResponseSchema,
  ROUTE_CURRENCY,
  ROUTE_MARKET,
  type RoutePriceStatus,
  SearchError,
} from '@flight-watch/contracts';
import {
  estimateDirectFlightMinutes,
  greatCircleKm,
  medianMinor,
  promotionFreshness,
  resolvePurchaseUrl,
} from '@flight-watch/domain';
import type { RouteCity } from '@flight-watch/database';
import { type CalendarDay, type FlightProvider, ProviderError } from '@flight-watch/providers';
import { withAffiliateTracking } from '../affiliate/affiliate-links.js';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PlacesService } from '../places/places.service.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '../pricing-source/key-value-store.js';
import { PriceCalendarCache } from '../pricing-source/price-calendar-cache.js';
import { DailyCallBudget, ProviderCooldown } from '../pricing-source/provider-guard.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Ida e volta na página: duração padrão (a página não pergunta a volta). */
const ROUND_TRIP_LENGTH_DAYS = 7;
/** Sem preço para escolher a data, o "ver todos os voos" abre daqui a 30 dias. */
const DEFAULT_LINK_OFFSET_DAYS = 30;
const SITEMAP_KEY = 'routes:sitemap:v1';
/**
 * A página viu a rota sem preço: o sitemap a pula por um dia. "Mais barato por
 * destino" e a consulta mensal da fonte às vezes discordam (achado na
 * verificação real); a página é quem decide se há preço para mostrar.
 */
const NO_PRICE_TTL_MS = DAY_MS;
const noPriceKey = (origin: string, destination: string) =>
  `routes:noprice:v1:${origin}:${destination}`;

/** O mês não foi consultado: orçamento do dia esgotado ou Retry-After em curso. */
class MonthRefused extends Error {
  constructor(readonly reason: 'budget_exhausted' | 'rate_limited') {
    super(`route page provider call refused: ${reason}`);
  }
}

type MonthResult = { kind: 'days'; days: CalendarDay[] } | { kind: 'refused' } | { kind: 'error' };

/** O que fica no cache: tudo menos o link, montado na leitura (afiliado pode mudar). */
const storedRouteSchema = getRouteResponseSchema.omit({ allFlightsUrl: true });
type StoredRoute = z.infer<typeof storedRouteSchema>;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Mês atual e os seguintes, `count` ao todo (AAAA-MM). */
export function routeMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return date.toISOString().slice(0, 7);
  });
}

function toPlace(city: RouteCity): GetRouteResponse['origin'] {
  return {
    code: city.code,
    name: city.name,
    countryCode: city.countryCode,
    countryName: city.countryName,
    coordinates:
      city.latitude !== null && city.longitude !== null
        ? { latitude: city.latitude, longitude: city.longitude }
        : null,
    airports: city.airports,
  };
}

/**
 * SPEC-033 — página da rota: lugares, fatos calculados, preços dos próximos
 * meses (cache por rota-mês da SPEC-032), promoção só do cache e link, numa
 * chamada. Mês sem cache consulta a fonte só dentro do orçamento próprio da
 * página (robôs de busca não gastam a cota do feed).
 */
@Injectable()
export class RoutesService {
  private readonly budget: DailyCallBudget;
  private readonly ttlMs: number;

  constructor(
    @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider,
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly calendar: PriceCalendarCache,
    private readonly places: PlacesService,
    private readonly promotions: PromotionsService,
    private readonly cooldown: ProviderCooldown,
    private readonly metrics: MetricsService,
  ) {
    this.ttlMs = config.ROUTE_PAGE_CACHE_TTL_MINUTES * MINUTE_MS;
    this.budget = new DailyCallBudget(store, {
      keyPrefix: 'routes:budget:v1',
      limit: config.ROUTE_PAGE_DAILY_CALL_BUDGET,
      exhaustedEvent: 'route_page_budget_exhausted',
      onRemaining: (remaining) => metrics.routePageBudgetRemaining.set(remaining),
    });
  }

  async get(
    originParam: string,
    destinationParam: string,
    query: GetRouteQuery,
  ): Promise<GetRouteResponse> {
    if (!this.config.ROUTE_PAGE_ENABLED) {
      throw new SearchError('ROUTE_NOT_FOUND', 'route page disabled');
    }
    const [originCode, destinationCode] = await Promise.all([
      this.places.resolveCity(originParam),
      this.places.resolveCity(destinationParam),
    ]);
    if (!originCode || !destinationCode || originCode === destinationCode) {
      throw new SearchError('ROUTE_NOT_FOUND', 'route not found');
    }

    const key = `routes:v1:${originCode}:${destinationCode}:${query.tripType}`;
    const cached = await this.read(key);
    if (cached) {
      this.metrics.routePageRequestsTotal.inc({
        prices: cached.prices.status.toLowerCase(),
        cache: 'hit',
      });
      return { ...cached, allFlightsUrl: this.allFlightsUrl(cached) };
    }

    const cities = await this.places.routeCities([originCode, destinationCode]);
    const origin = cities.get(originCode);
    const destination = cities.get(destinationCode);
    if (!origin || !destination) {
      throw new SearchError('ROUTE_NOT_FOUND', 'route not found');
    }

    const now = new Date();
    const distanceKm =
      origin.latitude !== null &&
      origin.longitude !== null &&
      destination.latitude !== null &&
      destination.longitude !== null
        ? greatCircleKm(
            { latitude: origin.latitude, longitude: origin.longitude },
            { latitude: destination.latitude, longitude: destination.longitude },
          )
        : null;

    const months = routeMonths(now, this.config.ROUTE_PAGE_MONTHS);
    const results = await Promise.all(
      months.map((month) => this.month(originCode, destinationCode, month, query.tripType)),
    );
    const today = isoDate(now.getTime());
    const days = results
      .flatMap((result) => (result.kind === 'days' ? result.days : []))
      // Data já passada ou preço com mais de 72 h não vale (SPEC-030).
      .filter((day) => day.date >= today && promotionFreshness(day.observedAt, now) !== 'EXPIRED')
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const status = priceStatus(results, days.length);
    const cheapest = days.reduce<CalendarDay | null>(
      (best, day) => (best === null || day.amountMinor < best.amountMinor ? day : best),
      null,
    );
    const promotion = await this.promotions.cachedPromotion(
      originCode,
      destinationCode,
      query.tripType,
    );

    const stored: StoredRoute = {
      origin: toPlace(origin),
      destination: toPlace(destination),
      distanceKm,
      estimatedDirectFlightMinutes:
        distanceKm === null ? null : estimateDirectFlightMinutes(distanceKm),
      tripType: query.tripType,
      prices: {
        status,
        months,
        days,
        cheapest,
        referenceMedianMinor:
          days.length > 0 ? medianMinor(days.map((day) => day.amountMinor)) : null,
        currency: ROUTE_CURRENCY,
      },
      promotion: promotion
        ? {
            discountBps: promotion.discountBps,
            departureDate: promotion.departureDate,
            amountMinor: promotion.price.amountMinor,
            explanation: promotion.reference.explanation,
          }
        : null,
      generatedAt: now.toISOString(),
    };

    // Só resposta completa vai ao cache: "atualizando" e "fonte fora" tentam de novo.
    if (status === 'OK' || status === 'NO_PRICES') {
      await this.write(key, stored);
    }
    if (status === 'NO_PRICES' && query.tripType === 'ONE_WAY') {
      await this.markNoPrice(originCode, destinationCode);
    }
    this.metrics.routePageRequestsTotal.inc({ prices: status.toLowerCase(), cache: 'miss' });
    return { ...stored, allFlightsUrl: this.allFlightsUrl(stored) };
  }

  /**
   * Rotas do sitemap (SPEC-033 §SEO): para cada cidade de ROUTE_SITEMAP_ORIGIN_CITIES,
   * os destinos que a fonte devolveu com preço (uma chamada por origem, dentro do
   * orçamento da página), guardadas por ROUTE_SITEMAP_TTL_MINUTES.
   */
  async sitemap(): Promise<ListRoutesResponse> {
    const empty = { routes: [], generatedAt: new Date().toISOString() };
    if (!this.config.ROUTE_PAGE_ENABLED || this.config.ROUTE_SITEMAP_ORIGIN_CITIES.length === 0) {
      return empty;
    }
    const cached = await this.readSitemap();
    if (cached) return cached;
    if (!this.provider.cheapestByDestination) return empty;

    const origins = await this.places.searchableCities(this.config.ROUTE_SITEMAP_ORIGIN_CITIES);
    // Só entra preço que a página vai mostrar: dentro dos meses dela e com idade
    // válida — senão o sitemap apontaria para página sem preço (noindex).
    const now = new Date();
    const shownMonths = new Set(routeMonths(now, this.config.ROUTE_PAGE_MONTHS));
    const today = isoDate(now.getTime());
    const routes: ListRoutesResponse['routes'] = [];
    let complete = true;
    for (const origin of origins.values()) {
      let fares;
      try {
        await this.beforeFetch();
        fares = await this.provider.cheapestByDestination({
          originIata: origin.code,
          tripType: 'ONE_WAY',
          currency: ROUTE_CURRENCY,
          market: ROUTE_MARKET,
        });
        this.metrics.routePageProviderCallsTotal.inc({ result: 'ok' });
      } catch (error) {
        complete = false;
        if (error instanceof MonthRefused) {
          this.metrics.routePageProviderCallsTotal.inc({ result: error.reason });
          break;
        }
        if (error instanceof ProviderError) {
          const result = await this.cooldown.note(error, 'route_page_provider_rate_limited');
          this.metrics.routePageProviderCallsTotal.inc({ result });
          continue;
        }
        throw error;
      }
      const destinations = await this.places.searchableCities(
        fares.map((fare) => fare.destinationIata),
      );
      for (const fare of fares) {
        const destination = destinations.get(fare.destinationIata);
        if (!destination || destination.code === origin.code) continue;
        const showable =
          shownMonths.has(fare.departureDate.slice(0, 7)) &&
          fare.departureDate >= today &&
          promotionFreshness(fare.observedAt, now) !== 'EXPIRED';
        if (!showable || (await this.seenWithoutPrice(origin.code, destination.code))) continue;
        routes.push({
          origin: { code: origin.code, name: origin.name },
          destination: { code: destination.code, name: destination.name },
        });
      }
    }
    const result = { routes, generatedAt: new Date().toISOString() };
    // Rodada incompleta (orçamento, Retry-After, fonte fora) não vai ao cache.
    if (complete) await this.writeSitemap(result);
    return result;
  }

  private async markNoPrice(origin: string, destination: string): Promise<void> {
    try {
      await this.store.set(noPriceKey(origin, destination), '1', NO_PRICE_TTL_MS);
    } catch {
      // Redis fora: o sitemap só não aprende desta vez.
    }
  }

  private async seenWithoutPrice(origin: string, destination: string): Promise<boolean> {
    try {
      return (await this.store.get(noPriceKey(origin, destination))) !== null;
    } catch {
      return false;
    }
  }

  private async readSitemap(): Promise<ListRoutesResponse | null> {
    try {
      const raw = await this.store.get(SITEMAP_KEY);
      if (raw === null) return null;
      const parsed = listRoutesResponseSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async writeSitemap(sitemap: ListRoutesResponse): Promise<void> {
    try {
      await this.store.set(
        SITEMAP_KEY,
        JSON.stringify(sitemap),
        this.config.ROUTE_SITEMAP_TTL_MINUTES * MINUTE_MS,
      );
    } catch {
      // Redis fora: calculado sem cache.
    }
  }

  /** Um mês da rota: cache por rota-mês; sem cache, a fonte dentro do orçamento. */
  private async month(
    origin: string,
    destination: string,
    month: string,
    tripType: GetRouteQuery['tripType'],
  ): Promise<MonthResult> {
    try {
      const result = await this.calendar.get(
        {
          originIata: origin,
          destinationIata: destination,
          month,
          tripType,
          tripLengthDays: tripType === 'ROUND_TRIP' ? ROUND_TRIP_LENGTH_DAYS : null,
          currency: ROUTE_CURRENCY,
          market: ROUTE_MARKET,
        },
        { beforeFetch: () => this.beforeFetch() },
      );
      if (!result) {
        return { kind: 'days', days: [] };
      }
      this.metrics.routePageProviderCallsTotal.inc({
        result: result.fromCache ? 'cache_hit' : 'ok',
      });
      return { kind: 'days', days: result.days };
    } catch (error) {
      if (error instanceof MonthRefused) {
        this.metrics.routePageProviderCallsTotal.inc({ result: error.reason });
        return { kind: 'refused' };
      }
      if (error instanceof ProviderError) {
        const result = await this.cooldown.note(error, 'route_page_provider_rate_limited');
        this.metrics.routePageProviderCallsTotal.inc({ result });
        return result === 'rate_limited' ? { kind: 'refused' } : { kind: 'error' };
      }
      throw error;
    }
  }

  /** Antes de toda chamada da página à fonte (nunca num acerto de cache). */
  private async beforeFetch(): Promise<void> {
    if (await this.cooldown.active()) throw new MonthRefused('rate_limited');
    if (!(await this.budget.reserve())) throw new MonthRefused('budget_exhausted');
  }

  /** "Ver todos os voos" pela allowlist e com afiliado (superfície ROUTE, SPEC-020). */
  private allFlightsUrl(route: StoredRoute): string | null {
    const departureDate =
      route.prices.cheapest?.date ?? isoDate(Date.now() + DEFAULT_LINK_OFFSET_DAYS * DAY_MS);
    const returnDate =
      route.tripType === 'ROUND_TRIP'
        ? isoDate(Date.parse(`${departureDate}T00:00:00Z`) + ROUND_TRIP_LENGTH_DAYS * DAY_MS)
        : null;
    const raw = this.provider.allFlightsUrl?.({
      originIata: route.origin.code,
      destinationIata: route.destination.code,
      departureDate,
      returnDate,
      tripType: route.tripType,
      cabin: 'ECONOMY',
      adults: 1,
      currency: ROUTE_CURRENCY,
      market: ROUTE_MARKET,
    });
    return withAffiliateTracking(
      resolvePurchaseUrl(raw ?? null, this.provider.strategy),
      this.provider.strategy,
      'ROUTE',
    );
  }

  private async read(key: string): Promise<StoredRoute | null> {
    try {
      const raw = await this.store.get(key);
      if (raw === null) return null;
      const parsed = storedRouteSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // Redis fora ou valor corrompido = sem cache
    }
  }

  private async write(key: string, route: StoredRoute): Promise<void> {
    try {
      await this.store.set(key, JSON.stringify(route), this.ttlMs);
    } catch {
      // Redis fora: resposta calculada sem cache.
    }
  }
}

/** Estado dos preços: o que faltou consultar diz mais que o que veio vazio. */
function priceStatus(results: readonly MonthResult[], dayCount: number): RoutePriceStatus {
  const refused = results.some((result) => result.kind === 'refused');
  const failed = results.some((result) => result.kind === 'error');
  if (dayCount > 0) return refused || failed ? 'UPDATING' : 'OK';
  if (refused) return 'UPDATING';
  if (failed) return 'UNAVAILABLE';
  return 'NO_PRICES';
}
