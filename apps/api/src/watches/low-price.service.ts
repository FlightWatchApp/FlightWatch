import { Inject, Injectable } from '@nestjs/common';
import type { WatchLowPrice } from '@flight-watch/contracts';
import {
  LOW_PRICE_HISTORY_WINDOW_DAYS,
  LOW_PRICE_LOWEST_WINDOW_DAYS,
  type DailyLow,
  type PromotionPrice,
  lowPriceThresholdMinor,
  nearbyDatesBaseline,
  referenceMonths,
  resolveTypicalPrice,
} from '@flight-watch/domain';
import {
  type AlertRule,
  type LowPriceReferences,
  findLowPriceReferences,
  findLowPriceReferencesForTargets,
} from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import { ProviderError } from '@flight-watch/providers';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { PriceCalendarCache } from '../pricing-source/price-calendar-cache.js';
import { ProviderCooldown } from '../pricing-source/provider-guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TripForBaseline {
  origin: string;
  destination: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  departureDate: string;
  returnDate: string | null;
  currency: string;
  market: string;
}

export interface NearbyDates {
  /** Mediana das datas próximas; null sem datas suficientes ou sem fonte. */
  baselineAmountMinor: number | null;
  /** Menor preço por data (gráfico), em ordem de data. */
  days: { date: string; amountMinor: number }[];
  /** Preço da própria data no calendário da fonte; null se não houver. */
  departureDayAmountMinor: number | null;
}

const NO_NEARBY_DATES: NearbyDates = {
  baselineAmountMinor: null,
  days: [],
  departureDayAmountMinor: null,
};

class CooldownActive extends Error {}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * SPEC-039: preço normal, linha de base e resumo do alerta de preço baixo para
 * a API. A regra em si é do domínio; aqui só se busca o dado (calendário da
 * fonte em cache, histórico do banco) e se monta a resposta.
 */
@Injectable()
export class LowPriceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: PriceCalendarCache,
    private readonly cooldown: ProviderCooldown,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  /** Porcentagem fixada na regra de Watches novos (o usuário não escolhe). */
  get dropPercent(): number {
    return this.config.ALERT_LOW_PRICE_DROP_PERCENT;
  }

  /**
   * Preços das datas próximas pelo mesmo cache da busca e das promoções
   * (SPEC-031/032): sem chamada quando o cache está fresco; com a fonte em
   * Retry-After, não chama. Qualquer falha vira "sem dados" — criar o Watch
   * nunca depende da fonte.
   */
  async nearbyDates(trip: TripForBaseline, now: Date = new Date()): Promise<NearbyDates> {
    const tripLengthDays = trip.returnDate
      ? daysBetween(trip.departureDate, trip.returnDate)
      : null;
    const prices: PromotionPrice[] = [];
    try {
      for (const month of referenceMonths(trip.departureDate, now)) {
        const result = await this.calendar.get(
          {
            originIata: trip.origin,
            destinationIata: trip.destination,
            month,
            tripType: trip.tripType,
            tripLengthDays,
            currency: trip.currency,
            market: trip.market,
          },
          {
            beforeFetch: async () => {
              if (await this.cooldown.active()) throw new CooldownActive();
            },
          },
        );
        if (!result) return NO_NEARBY_DATES; // provedor sem calendário
        for (const day of result.days) {
          prices.push({
            departureDate: day.date,
            amountMinor: day.amountMinor,
            currency: trip.currency,
            observedAt: day.observedAt,
          });
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        await this.cooldown.note(error, 'low_price_provider_rate_limited');
      } else if (!(error instanceof CooldownActive)) {
        throw error;
      }
      logEvent({ event: 'low_price_nearby_dates_unavailable' });
      return NO_NEARBY_DATES;
    }

    const baseline = nearbyDatesBaseline({
      prices,
      departureDate: trip.departureDate,
      currency: trip.currency,
      now,
    });
    const cheapest = new Map<string, number>();
    for (const price of prices) {
      const current = cheapest.get(price.departureDate);
      if (current === undefined || price.amountMinor < current) {
        cheapest.set(price.departureDate, price.amountMinor);
      }
    }
    const days = [...cheapest]
      .map(([date, amountMinor]) => ({ date, amountMinor }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      baselineAmountMinor: baseline?.amountMinor ?? null,
      days,
      departureDayAmountMinor: cheapest.get(trip.departureDate) ?? null,
    };
  }

  /** Referências de uma viagem (histórico do banco) até agora. */
  referencesFor(searchTargetId: string, currency: string): Promise<LowPriceReferences> {
    return findLowPriceReferences(this.prisma.client, {
      searchTargetId,
      currency,
      until: new Date(),
      historyWindowDays: LOW_PRICE_HISTORY_WINDOW_DAYS,
      lowestWindowDays: LOW_PRICE_LOWEST_WINDOW_DAYS,
    });
  }

  /**
   * Resumo `lowPrice` de cada Watch, em lote (duas consultas para a lista
   * toda). Watch sem regra `LOW_PRICE` ativa fica `null`.
   */
  async summaries(
    watches: readonly { searchTargetId: string; currency: string; alertRules: AlertRule[] }[],
  ): Promise<(WatchLowPrice | null)[]> {
    const withRule = watches.map((watch) =>
      watch.alertRules.find((rule) => rule.type === 'LOW_PRICE' && rule.enabled),
    );
    const targets = watches
      .filter((_, index) => withRule[index] !== undefined)
      .map((watch) => ({ id: watch.searchTargetId, currency: watch.currency }));
    const references = await findLowPriceReferencesForTargets(this.prisma.client, {
      targets,
      until: new Date(),
      historyWindowDays: LOW_PRICE_HISTORY_WINDOW_DAYS,
      lowestWindowDays: LOW_PRICE_LOWEST_WINDOW_DAYS,
    });
    return watches.map((watch, index) => {
      const rule = withRule[index];
      if (!rule || rule.dropPercent === null) return null;
      return summarize(rule, references.get(watch.searchTargetId));
    });
  }
}

export function summarize(
  rule: Pick<AlertRule, 'dropPercent' | 'baselineAmountMinor'>,
  references: { dailyLows: DailyLow[]; lowestAmountMinor: number | null } | undefined,
): WatchLowPrice {
  const dropPercent = rule.dropPercent ?? 0;
  const typical = resolveTypicalPrice({
    dailyLows: references?.dailyLows ?? [],
    baselineAmountMinor: rule.baselineAmountMinor,
  });
  return {
    dropPercent,
    typicalAmountMinor: typical?.amountMinor ?? null,
    typicalSource: typical?.source ?? null,
    thresholdAmountMinor: typical ? lowPriceThresholdMinor(typical.amountMinor, dropPercent) : null,
    lowestAmountMinor: references?.lowestAmountMinor ?? null,
  };
}
