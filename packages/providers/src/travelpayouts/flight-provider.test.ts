import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProviderError } from '../errors.js';
import type { FlightProvider, FlightSearchQuery } from '../port.js';
import { TravelpayoutsFlightProvider } from './flight-provider.js';

const TOKEN = 'test-token-0123456789abcdef';
const NOW = new Date('2026-10-06T12:00:00Z');
const context = { correlationId: 'corr-1', searchExecutionId: 'exec-1' };

/** Formato real de v2/prices/latest (sondagem de 2026-10-06). */
function entry(overrides: Record<string, unknown> = {}) {
  return {
    depart_date: '2026-11-17',
    origin: 'SAO',
    destination: 'NYC',
    gate: 'Kiwi.com',
    return_date: '',
    found_at: '2026-10-06T04:53:47',
    trip_class: 0,
    value: 2736,
    number_of_changes: 1,
    duration: 785,
    distance: 7682,
    show_to_affiliates: true,
    actual: true,
    ...overrides,
  };
}

const oneWay: FlightSearchQuery = {
  originIata: 'SAO',
  destinationIata: 'NYC',
  departureDate: '2026-11-17',
  returnDate: null,
  tripType: 'ONE_WAY',
  cabin: 'ECONOMY',
  adults: 1,
  currency: 'BRL',
  market: 'BR',
};

interface Call {
  url: string;
  headers: Record<string, string>;
}

function fakeFetch(response: {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    const body =
      typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? {});
    return new Response(body, {
      status: response.status ?? 200,
      headers: response.headers ?? {},
    });
  }) as typeof fetch;
  return { fn, calls };
}

/** Pela porta, como o sistema consome o adaptador (ADR-004). */
function provider(fetchFn: typeof fetch): FlightProvider {
  return new TravelpayoutsFlightProvider({
    token: TOKEN,
    timeoutMs: 5000,
    fetchFn,
    now: () => NOW,
  });
}

async function classOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error.errorClass;
    throw error;
  }
  throw new Error('esperava ProviderError');
}

describe('TravelpayoutsFlightProvider (SPEC-030)', () => {
  // AC-1
  it('transforma a entrada do dia pedido em oferta-resumo', async () => {
    const { fn } = fakeFetch({ body: { success: true, data: [entry()] } });

    const result = await provider(fn).search(oneWay, context);

    expect(result.kind).toBe('offers');
    if (result.kind !== 'offers') return;
    expect(result.offers).toEqual([
      {
        providerOfferId: 'tp|SAO|NYC|2026-11-17|-|Kiwi.com|2026-10-06T04:53:47',
        totalAmountMinor: 273_600,
        currency: 'BRL',
        passengerCount: 1,
        segments: [],
        fareSummary: {
          originCode: 'SAO',
          destinationCode: 'NYC',
          departureDate: '2026-11-17',
          returnDate: null,
          stops: 1,
          durationMinutes: 785,
        },
        observedAt: '2026-10-06T04:53:47.000Z',
        expiresAt: '2026-10-09T04:53:47.000Z',
        deeplink: 'https://www.aviasales.com/search/SAO1711NYC1',
        qualityFlags: ['CACHED_PRICE'],
      },
    ]);
  });

  // AC-4
  it('consulta o mês certo, com o token só no header', async () => {
    const { fn, calls } = fakeFetch({ body: { success: true, data: [] } });

    await provider(fn).search(oneWay, context);

    const [call] = calls;
    const url = new URL(call?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://api.travelpayouts.com/v2/prices/latest');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      origin: 'SAO',
      destination: 'NYC',
      currency: 'brl',
      period_type: 'month',
      beginning_of_period: '2026-11-01',
      one_way: 'true',
    });
    expect(call?.url).not.toContain(TOKEN);
    expect(call?.headers['X-Access-Token']).toBe(TOKEN);
  });

  it('ida e volta: pede one_way=false, filtra a volta e monta o link com as duas datas', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ return_date: '2026-11-25', value: 4100 }),
          entry({ return_date: '2026-11-30', value: 3000 }),
        ],
      },
    });

    const result = await provider(fn).search(
      { ...oneWay, tripType: 'ROUND_TRIP', returnDate: '2026-11-25' },
      context,
    );

    expect(new URL(calls[0]?.url ?? '').searchParams.get('one_way')).toBe('false');
    expect(result.kind).toBe('offers');
    if (result.kind !== 'offers') return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.totalAmountMinor).toBe(410_000);
    expect(result.offers[0]?.deeplink).toBe('https://www.aviasales.com/search/SAO1711NYC25111');
  });

  // AC-2
  it('ignora outro dia, classe executiva, preço inválido e actual=false', async () => {
    const { fn } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ depart_date: '2026-11-18' }),
          entry({ trip_class: 1 }),
          entry({ value: 0 }),
          entry({ actual: false }),
          entry({ return_date: '2026-11-25' }),
        ],
      },
    });

    expect(await provider(fn).search(oneWay, context)).toEqual({ kind: 'no_offers' });
  });

  it('found_at no futuro não vira observação no futuro', async () => {
    const { fn } = fakeFetch({
      body: { success: true, data: [entry({ found_at: '2026-10-07T00:00:00' })] },
    });

    const result = await provider(fn).search(oneWay, context);

    if (result.kind !== 'offers') throw new Error('esperava ofertas');
    expect(result.offers[0]?.observedAt).toBe(NOW.toISOString());
  });

  it('entrada sem duração vira durationMinutes null', async () => {
    const { fn } = fakeFetch({ body: { success: true, data: [entry({ duration: null })] } });
    const result = await provider(fn).search(oneWay, context);
    if (result.kind !== 'offers') throw new Error('esperava ofertas');
    expect(result.offers[0]?.fareSummary?.durationMinutes).toBeNull();
  });

  it('recusa sem chamar a API: classe executiva ou mais de 1 adulto', async () => {
    const { fn, calls } = fakeFetch({ body: { success: true, data: [] } });
    expect(await classOf(provider(fn).search({ ...oneWay, cabin: 'BUSINESS' }, context))).toBe(
      'INVALID_QUERY',
    );
    expect(await classOf(provider(fn).search({ ...oneWay, adults: 2 }, context))).toBe(
      'INVALID_QUERY',
    );
    expect(calls).toHaveLength(0);
  });

  // AC-3
  it.each([
    [401, 'AUTHENTICATION'],
    [403, 'AUTHENTICATION'],
    [400, 'INVALID_QUERY'],
    [429, 'RATE_LIMITED'],
    [500, 'UNAVAILABLE'],
    [503, 'UNAVAILABLE'],
  ])('HTTP %i vira %s', async (status, expected) => {
    const { fn } = fakeFetch({ status, body: { success: false } });
    expect(await classOf(provider(fn).search(oneWay, context))).toBe(expected);
  });

  it('429 respeita Retry-After', async () => {
    const { fn } = fakeFetch({ status: 429, headers: { 'retry-after': '30' } });
    try {
      await provider(fn).search(oneWay, context);
      throw new Error('esperava erro');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).retryAfterMs).toBe(30_000);
    }
  });

  it('JSON inválido, formato inesperado ou success=false viram MALFORMED_RESPONSE', async () => {
    expect(
      await classOf(provider(fakeFetch({ body: 'não é json' }).fn).search(oneWay, context)),
    ).toBe('MALFORMED_RESPONSE');
    expect(
      await classOf(provider(fakeFetch({ body: { data: 'x' } }).fn).search(oneWay, context)),
    ).toBe('MALFORMED_RESPONSE');
    expect(
      await classOf(
        provider(fakeFetch({ body: { success: false, error: 'boom', data: [] } }).fn).search(
          oneWay,
          context,
        ),
      ),
    ).toBe('MALFORMED_RESPONSE');
  });

  it('falha de rede vira UNAVAILABLE e tempo esgotado vira TIMEOUT', async () => {
    const network = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await classOf(provider(network).search(oneWay, context))).toBe('UNAVAILABLE');

    const timeout = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as typeof fetch;
    expect(await classOf(provider(timeout).search(oneWay, context))).toBe('TIMEOUT');
  });

  it('a mensagem de erro nunca contém o token', async () => {
    const { fn } = fakeFetch({ status: 401 });
    try {
      await provider(fn).search(oneWay, context);
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(TOKEN);
    }
  });
});

describe('TravelpayoutsFlightProvider.priceCalendar (SPEC-031 AC-1)', () => {
  const calendarQuery = {
    originIata: 'SAO',
    destinationIata: 'NYC',
    month: '2026-11',
    tripType: 'ONE_WAY' as const,
    tripLengthDays: null,
    currency: 'BRL',
  };

  it('um dia por data, com o menor preço, em ordem', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ depart_date: '2026-11-20', value: 3000 }),
          entry({ depart_date: '2026-11-17', value: 2800, number_of_changes: 0 }),
          entry({ depart_date: '2026-11-17', value: 2568, number_of_changes: 1 }),
          entry({ depart_date: '2026-12-01', value: 100 }), // outro mês
        ],
      },
    });

    const days = await provider(fn).priceCalendar?.(calendarQuery);

    expect(days).toEqual([
      {
        date: '2026-11-17',
        amountMinor: 256_800,
        stops: 1,
        observedAt: '2026-10-06T04:53:47.000Z',
      },
      {
        date: '2026-11-20',
        amountMinor: 300_000,
        stops: 1,
        observedAt: '2026-10-06T04:53:47.000Z',
      },
    ]);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('beginning_of_period')).toBe('2026-11-01');
  });

  it('ida e volta: só a mesma duração de viagem', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ depart_date: '2026-11-10', return_date: '2026-11-17', value: 4000 }), // 7 dias
          entry({ depart_date: '2026-11-10', return_date: '2026-11-12', value: 1000 }), // 2 dias
          entry({ depart_date: '2026-11-11', return_date: '2026-11-18', value: 4200 }), // 7 dias
          entry({ depart_date: '2026-11-12', value: 500 }), // só ida
        ],
      },
    });

    const days = await provider(fn).priceCalendar?.({
      ...calendarQuery,
      tripType: 'ROUND_TRIP',
      tripLengthDays: 7,
    });

    expect(days?.map((day) => [day.date, day.amountMinor])).toEqual([
      ['2026-11-10', 400_000],
      ['2026-11-11', 420_000],
    ]);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('one_way')).toBe('false');
  });

  it('preço encontrado há mais de 72 h fica fora; classe executiva e actual=false também', async () => {
    const { fn } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ depart_date: '2026-11-17', found_at: '2026-10-02T00:00:00' }),
          entry({ depart_date: '2026-11-18', trip_class: 1 }),
          entry({ depart_date: '2026-11-19', actual: false }),
          entry({ depart_date: '2026-11-20' }),
        ],
      },
    });

    const days = await provider(fn).priceCalendar?.(calendarQuery);
    expect(days?.map((day) => day.date)).toEqual(['2026-11-20']);
  });

  it('allFlightsUrl é a busca da Aviasales', () => {
    expect(provider(fakeFetch({}).fn).allFlightsUrl?.(oneWay)).toBe(
      'https://www.aviasales.com/search/SAO1711NYC1',
    );
  });
});

describe('TravelpayoutsFlightProvider.cheapestByDestination (SPEC-032 AC-1)', () => {
  const query = {
    originIata: 'CGR',
    tripType: 'ONE_WAY' as const,
    currency: 'BRL',
    market: 'BR',
  };
  // Sondagem real de 2026-10-07 (v2/prices/latest só com origin=CGR), recortada.
  const fixture: unknown = JSON.parse(
    readFileSync(new URL('./fixtures/latest-by-origin-cgr.json', import.meta.url), 'utf8'),
  );
  const FIXTURE_NOW = new Date('2026-10-07T18:00:00Z');

  function at(now: Date, fetchFn: typeof fetch): FlightProvider {
    return new TravelpayoutsFlightProvider({
      token: TOKEN,
      timeoutMs: 5000,
      fetchFn,
      now: () => now,
    });
  }

  it('fixture real: um preço por destino, mais de 72 h fora', async () => {
    const { fn, calls } = fakeFetch({ body: fixture });

    const fares = await at(FIXTURE_NOW, fn).cheapestByDestination?.(query);

    // SSA, RIO e SAO foram vistos há mais de 72 h.
    expect(fares).toEqual([
      {
        destinationIata: 'SRZ',
        departureDate: '2026-10-17',
        returnDate: null,
        amountMinor: 98_200,
        stops: 1,
        observedAt: '2026-10-07T15:50:01.000Z',
      },
      {
        destinationIata: 'NAT',
        departureDate: '2026-10-16',
        returnDate: null,
        amountMinor: 104_800,
        stops: 2,
        observedAt: '2026-10-06T15:25:36.000Z',
      },
      {
        destinationIata: 'STM',
        departureDate: '2026-10-30',
        returnDate: null,
        amountMinor: 156_300,
        stops: 3,
        observedAt: '2026-10-07T00:53:18.000Z',
      },
    ]);
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect(params.get('origin')).toBe('CGR');
    expect(params.has('destination')).toBe(false);
    expect(params.get('one_way')).toBe('true');
    expect(params.get('currency')).toBe('brl');
    expect(calls[0]?.headers['X-Access-Token']).toBe(TOKEN);
    expect(calls[0]?.url).not.toContain(TOKEN);
  });

  it('mais de uma entrada por destino: fica a mais barata; a própria origem sai', async () => {
    const { fn } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ origin: 'SAO', destination: 'LIS', depart_date: '2026-11-20', value: 3000 }),
          entry({ origin: 'SAO', destination: 'LIS', depart_date: '2026-11-21', value: 2500 }),
          entry({ origin: 'SAO', destination: 'SAO', value: 10 }),
          entry({ origin: 'SAO', destination: 'MIA', trip_class: 1, value: 100 }),
          entry({ origin: 'SAO', destination: 'BSB', actual: false }),
        ],
      },
    });

    const fares = await provider(fn).cheapestByDestination?.({ ...query, originIata: 'SAO' });

    expect(
      fares?.map((fare) => [fare.destinationIata, fare.departureDate, fare.amountMinor]),
    ).toEqual([['LIS', '2026-11-21', 250_000]]);
  });

  it('ida e volta: só entradas com volta, e one_way=false', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        success: true,
        data: [
          entry({ destination: 'LIS', depart_date: '2026-11-10', return_date: '2026-11-17' }),
          entry({ destination: 'MIA', depart_date: '2026-11-12' }),
        ],
      },
    });

    const fares = await provider(fn).cheapestByDestination?.({
      ...query,
      originIata: 'SAO',
      tripType: 'ROUND_TRIP',
    });

    expect(fares?.map((fare) => [fare.destinationIata, fare.returnDate])).toEqual([
      ['LIS', '2026-11-17'],
    ]);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('one_way')).toBe('false');
  });

  it('429 respeita Retry-After', async () => {
    const { fn } = fakeFetch({ status: 429, headers: { 'retry-after': '30' } });
    const error = await provider(fn)
      .cheapestByDestination?.(query)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).retryAfterMs).toBe(30_000);
  });
});
