import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { DayFlightDetails, FlightDetailsQuery, FlightProvider } from '@flight-watch/providers';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';
import { KEY_VALUE_STORE, type KeyValueStore } from './key-value-store.js';
import type { RouteMonthOptions } from './price-calendar-cache.js';

const cachedDetailsSchema = z.array(
  z.object({
    date: z.string(),
    carrierCode: z.string(),
    flightNumber: z.string().nullable(),
    departureAt: z.string(),
    originAirport: z.string(),
    destinationAirport: z.string(),
    durationMinutes: z.number().nullable(),
    stops: z.number().int(),
    amountMinor: z.number().int(),
  }),
);

/**
 * SPEC-038: detalhes do voo mais barato por dia, por rota e mês, no Redis com
 * o mesmo TTL do calendário. Reconstruível; Redis fora = sem cache. Só para
 * exibição — o preço mostrado é o do calendário.
 */
@Injectable()
export class FlightDetailsCache {
  private readonly ttlMs: number;

  constructor(
    @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider,
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(API_CONFIG) config: ApiConfig,
  ) {
    this.ttlMs = config.PRICE_CALENDAR_CACHE_TTL_MINUTES * 60_000;
  }

  /** null quando o provedor não tem a capacidade. Erro da fonte sobe para quem chamou. */
  async get(
    query: FlightDetailsQuery,
    options: RouteMonthOptions = {},
  ): Promise<DayFlightDetails[] | null> {
    if (!this.provider.flightDetailsByDay) return null;
    const key = [
      'flight-details:v1',
      query.originIata,
      query.destinationIata,
      query.month,
      query.currency,
    ].join(':');
    const cached = await this.read(key);
    if (cached) return cached;

    await options.beforeFetch?.();
    const details = await this.provider.flightDetailsByDay(query);
    try {
      await this.store.set(key, JSON.stringify(details), this.ttlMs);
    } catch {
      // cache fora: segue sem guardar
    }
    return details;
  }

  private async read(key: string): Promise<DayFlightDetails[] | null> {
    try {
      const raw = await this.store.get(key);
      if (raw === null) return null;
      const parsed = cachedDetailsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
