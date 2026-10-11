import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { calendarDaySchema } from '@flight-watch/contracts';
import { PROMOTION_MAX_PRICE_AGE_MS } from '@flight-watch/domain';
import type { CalendarDay, FlightProvider, PriceCalendarQuery } from '@flight-watch/providers';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';
import { KEY_VALUE_STORE, type KeyValueStore } from './key-value-store.js';

export interface RouteMonthQuery extends PriceCalendarQuery {
  market: string;
}

export interface RouteMonthResult {
  days: CalendarDay[];
  fromCache: boolean;
}

export interface RouteMonthOptions {
  /**
   * Chamado antes de consultar a fonte (nunca num acerto de cache). Lançar
   * aqui impede a chamada — é assim que o feed aplica orçamento e Retry-After
   * sem afetar o calendário da busca.
   */
  beforeFetch?: () => Promise<void>;
}

const cachedDaysSchema = z.array(calendarDaySchema);

/**
 * SPEC-032 §Cache: preços da rota por mês, compartilhados entre o calendário
 * da busca (SPEC-031) e o feed de promoções — mesmo dado, uma chamada só.
 */
@Injectable()
export class PriceCalendarCache {
  private readonly ttlMs: number;

  constructor(
    @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider,
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(API_CONFIG) config: ApiConfig,
  ) {
    this.ttlMs = config.PRICE_CALENDAR_CACHE_TTL_MINUTES * 60_000;
  }

  get supported(): boolean {
    return this.provider.priceCalendar !== undefined;
  }

  /** null quando o provedor não tem calendário. Erro da fonte sobe para quem chamou. */
  async get(
    query: RouteMonthQuery,
    options: RouteMonthOptions = {},
  ): Promise<RouteMonthResult | null> {
    if (!this.provider.priceCalendar) {
      return null;
    }
    const key = routeMonthKey(query);
    const cached = await this.read(key);
    if (cached) {
      return { days: withoutExpired(cached, new Date()), fromCache: true };
    }

    await options.beforeFetch?.();
    const days = await this.provider.priceCalendar({
      originIata: query.originIata,
      destinationIata: query.destinationIata,
      month: query.month,
      tripType: query.tripType,
      tripLengthDays: query.tripLengthDays,
      currency: query.currency,
    });
    await this.write(key, days);
    return { days, fromCache: false };
  }

  private async read(key: string): Promise<CalendarDay[] | null> {
    try {
      const raw = await this.store.get(key);
      if (raw === null) return null;
      const parsed = cachedDaysSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // cache fora ou corrompido = sem cache
    }
  }

  private async write(key: string, days: CalendarDay[]): Promise<void> {
    try {
      await this.store.set(key, JSON.stringify(days), this.ttlMs);
    } catch {
      // cache fora: segue sem guardar
    }
  }
}

export function routeMonthKey(query: RouteMonthQuery): string {
  return [
    'price-calendar:v1',
    query.originIata,
    query.destinationIata,
    query.month,
    query.tripType,
    query.tripLengthDays ?? '-',
    query.currency,
    query.market,
  ].join(':');
}

/** Mesma regra de 72 h da SPEC-030, reaplicada na leitura do cache. */
function withoutExpired(days: CalendarDay[], now: Date): CalendarDay[] {
  return days.filter(
    (day) => now.getTime() - Date.parse(day.observedAt) <= PROMOTION_MAX_PRICE_AGE_MS,
  );
}
