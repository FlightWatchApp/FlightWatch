import { z } from 'zod';
import type { FlightOffer } from '@flight-watch/domain';
import { ProviderError } from '../errors.js';
import type { FlightProvider, FlightSearchQuery, ProviderSearchResult } from '../port.js';

/**
 * SPEC-030 / ADR-008 — Travelpayouts Data API (`v2/prices/latest`), um cache
 * do que o público da Aviasales pesquisou. Devolve o **menor preço encontrado
 * por dia**, por cidade, sem horário nem companhia: cada entrada vira uma
 * oferta-resumo (`fareSummary`), nunca trechos inventados.
 */

export const TRAVELPAYOUTS_API_BASE_URL = 'https://api.travelpayouts.com';
const AVIASALES_SEARCH_URL = 'https://www.aviasales.com/search';

/** Preço encontrado há mais de 72 h não vale mais como "atual" (SPEC-030, a calibrar). */
const CACHED_PRICE_TTL_MS = 72 * 60 * 60 * 1000;

const entrySchema = z.object({
  depart_date: z.string(),
  return_date: z.string().nullish(),
  origin: z.string(),
  destination: z.string(),
  gate: z.string().nullish(),
  found_at: z.string(),
  trip_class: z.number().int().nullish(),
  value: z.number(),
  number_of_changes: z.number().int().nullish(),
  duration: z.number().nullish(),
  actual: z.boolean().nullish(),
});

const responseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().nullish(),
  data: z.array(z.unknown()),
});

type Entry = z.infer<typeof entrySchema>;

export interface TravelpayoutsFlightProviderOptions {
  token: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  now?: () => Date;
}

/** "2026-11-17" → "1711" (formato do link de busca da Aviasales). */
function ddmm(date: string): string {
  return `${date.slice(8, 10)}${date.slice(5, 7)}`;
}

/** Busca da Aviasales para a rota e as datas — "ver todos os voos" (ADR-008 §4). */
export function buildAviasalesSearchUrl(query: FlightSearchQuery): string {
  const back = query.returnDate ? ddmm(query.returnDate) : '';
  return `${AVIASALES_SEARCH_URL}/${query.originIata}${ddmm(query.departureDate)}${query.destinationIata}${back}${query.adults}`;
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export class TravelpayoutsFlightProvider implements FlightProvider {
  readonly strategy = 'TRAVELPAYOUTS';
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(private readonly options: TravelpayoutsFlightProviderOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.baseUrl = options.baseUrl ?? TRAVELPAYOUTS_API_BASE_URL;
    this.now = options.now ?? (() => new Date());
  }

  async search(query: FlightSearchQuery): Promise<ProviderSearchResult> {
    // O cache só tem econômica e preço por pessoa.
    if (query.cabin !== 'ECONOMY') {
      throw new ProviderError('INVALID_QUERY', 'travelpayouts: only ECONOMY is available');
    }
    if (query.adults !== 1) {
      throw new ProviderError('INVALID_QUERY', 'travelpayouts: cached prices are per 1 adult');
    }

    const entries = await this.fetchMonth(query);
    const now = this.now();
    const offers = entries
      .filter((entry) => this.matches(entry, query))
      .map((entry) => this.toOffer(entry, query, now));
    return offers.length > 0 ? { kind: 'offers', offers } : { kind: 'no_offers' };
  }

  private async fetchMonth(query: FlightSearchQuery): Promise<Entry[]> {
    const params = new URLSearchParams({
      origin: query.originIata,
      destination: query.destinationIata,
      currency: query.currency.toLowerCase(),
      period_type: 'month',
      beginning_of_period: `${query.departureDate.slice(0, 7)}-01`,
      one_way: String(query.tripType === 'ONE_WAY'),
      limit: '1000',
      show_to_affiliates: 'true',
    });

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/v2/prices/latest?${params.toString()}`, {
        // Token só no header: nunca na URL, que pode acabar em log de proxy.
        headers: { 'X-Access-Token': this.options.token, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new ProviderError(
        timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
        timedOut ? 'travelpayouts: request timed out' : 'travelpayouts: request failed',
      );
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        throw new ProviderError('AUTHENTICATION', `travelpayouts: HTTP ${status}`);
      }
      if (status === 429) {
        const retryAfter = retryAfterMs(response.headers.get('retry-after'));
        throw new ProviderError(
          'RATE_LIMITED',
          'travelpayouts: HTTP 429',
          retryAfter === undefined ? undefined : { retryAfterMs: retryAfter },
        );
      }
      if (status >= 400 && status < 500) {
        throw new ProviderError('INVALID_QUERY', `travelpayouts: HTTP ${status}`);
      }
      throw new ProviderError('UNAVAILABLE', `travelpayouts: HTTP ${status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProviderError('MALFORMED_RESPONSE', 'travelpayouts: body is not JSON');
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success || parsed.data.success === false) {
      throw new ProviderError('MALFORMED_RESPONSE', 'travelpayouts: unexpected response shape');
    }
    // Entrada malformada é descartada; não derruba as demais.
    return parsed.data.data.flatMap((raw) => {
      const entry = entrySchema.safeParse(raw);
      return entry.success ? [entry.data] : [];
    });
  }

  private matches(entry: Entry, query: FlightSearchQuery): boolean {
    const entryReturn = entry.return_date ? entry.return_date : null;
    return (
      entry.depart_date === query.departureDate &&
      entryReturn === query.returnDate &&
      (entry.trip_class ?? 0) === 0 &&
      entry.actual !== false &&
      Number.isFinite(entry.value) &&
      entry.value > 0
    );
  }

  private toOffer(entry: Entry, query: FlightSearchQuery, now: Date): FlightOffer {
    // `found_at` vem sem fuso; tratado como UTC (ADR-008) e nunca no futuro.
    const foundAt = new Date(`${entry.found_at}Z`);
    const observedAt = Number.isNaN(foundAt.getTime()) || foundAt > now ? now : foundAt;
    const duration =
      typeof entry.duration === 'number' && Number.isInteger(entry.duration) && entry.duration > 0
        ? entry.duration
        : null;

    return {
      providerOfferId: [
        'tp',
        query.originIata,
        query.destinationIata,
        query.departureDate,
        query.returnDate ?? '-',
        entry.gate ?? '-',
        entry.found_at,
      ].join('|'),
      totalAmountMinor: Math.round(entry.value * 100),
      currency: query.currency,
      passengerCount: query.adults,
      segments: [],
      fareSummary: {
        // A resposta vem por cidade; consultamos por cidade (SPEC-029).
        originCode: query.originIata,
        destinationCode: query.destinationIata,
        departureDate: query.departureDate,
        returnDate: query.returnDate,
        stops: entry.number_of_changes ?? 0,
        durationMinutes: duration,
      },
      observedAt: observedAt.toISOString(),
      expiresAt: new Date(observedAt.getTime() + CACHED_PRICE_TTL_MS).toISOString(),
      deeplink: buildAviasalesSearchUrl(query),
      qualityFlags: ['CACHED_PRICE'],
    };
  }
}
