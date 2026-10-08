import { describe, expect, it } from 'vitest';
import { ProviderError } from '../errors.js';
import type { FlightSearchQuery, ProviderContext } from '../port.js';
import {
  SimulatedFlightProvider,
  failingScenario,
  noOffersScenario,
  offersScenario,
  sequenceScenario,
} from './simulated-flight-provider.js';

const query: FlightSearchQuery = {
  originIata: 'DOU',
  destinationIata: 'GRU',
  departureDate: '2026-12-20',
  returnDate: null,
  tripType: 'ONE_WAY',
  cabin: 'ECONOMY',
  adults: 1,
  currency: 'BRL',
  market: 'BR',
};

const context: ProviderContext = { correlationId: 'corr-1', searchExecutionId: 'exec-1' };

describe('SimulatedFlightProvider default scenario', () => {
  it('returns a deterministic offer matching the query', async () => {
    const provider = new SimulatedFlightProvider();
    const result = await provider.search(query, context);
    expect(result.kind).toBe('offers');
    if (result.kind === 'offers') {
      expect(result.offers).toHaveLength(1);
      expect(result.offers[0]?.currency).toBe('BRL');
      expect(result.offers[0]?.segments[0]?.originIata).toBe('DOU');
    }
  });

  it('is deterministic for the same route and date', async () => {
    const provider = new SimulatedFlightProvider();
    const a = await provider.search(query, context);
    const b = await provider.search(query, context);
    if (a.kind === 'offers' && b.kind === 'offers') {
      expect(a.offers[0]?.totalAmountMinor).toBe(b.offers[0]?.totalAmountMinor);
    }
  });

  // SPEC-018: sem isso, PriceObservation.deeplink/expiresAt ficam sempre null
  // e a projeção de "comprar passagem" nunca tem dado real pra mostrar.
  it('includes a deeplink on an allowlisted simulated host and a future expiresAt', async () => {
    const provider = new SimulatedFlightProvider();
    const result = await provider.search(query, context);
    expect(result.kind).toBe('offers');
    if (result.kind === 'offers') {
      const offer = result.offers[0];
      expect(offer?.deeplink).toMatch(
        /^https:\/\/booking\.simulated-provider\.flightwatch\.dev\/checkout\//,
      );
      expect(offer?.expiresAt).toBeDefined();
      expect(new Date(offer?.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now());
    }
  });
});

describe('scenario builders', () => {
  it('offersScenario returns the given offers verbatim', async () => {
    const provider = new SimulatedFlightProvider(offersScenario([]));
    const result = await provider.search(query, context);
    expect(result).toEqual({ kind: 'offers', offers: [] });
  });

  // EVAL-PRICE-003: resposta válida sem ofertas -> no_offers.
  it('noOffersScenario returns no_offers', async () => {
    const provider = new SimulatedFlightProvider(noOffersScenario());
    const result = await provider.search(query, context);
    expect(result).toEqual({ kind: 'no_offers' });
  });

  // EVAL-PROVIDER-001: rate limit rejeita como Promise, não como throw síncrono.
  it('failingScenario rejects with a classified ProviderError', async () => {
    const provider = new SimulatedFlightProvider(
      failingScenario('RATE_LIMITED', 'simulated 429', { retryAfterMs: 5000 }),
    );
    await expect(provider.search(query, context)).rejects.toBeInstanceOf(ProviderError);
    await expect(provider.search(query, context)).rejects.toMatchObject({
      errorClass: 'RATE_LIMITED',
      retryable: true,
      retryAfterMs: 5000,
    });
  });

  // EVAL-PROVIDER-004: duas falhas temporárias seguidas de sucesso.
  it('sequenceScenario replays results in order and holds the last one', async () => {
    const provider = new SimulatedFlightProvider(
      sequenceScenario([
        failingScenario('TIMEOUT', 'first timeout'),
        failingScenario('TIMEOUT', 'second timeout'),
        offersScenario([]),
      ]),
    );

    await expect(provider.search(query, context)).rejects.toMatchObject({ errorClass: 'TIMEOUT' });
    await expect(provider.search(query, context)).rejects.toMatchObject({ errorClass: 'TIMEOUT' });
    await expect(provider.search(query, context)).resolves.toEqual({ kind: 'offers', offers: [] });
    await expect(provider.search(query, context)).resolves.toEqual({ kind: 'offers', offers: [] });
  });
});

describe('SimulatedFlightProvider — calendário e todos os voos (SPEC-031)', () => {
  const provider = new SimulatedFlightProvider();
  const calendarQuery = {
    originIata: 'SAO',
    destinationIata: 'LIS',
    month: '2027-02',
    tripType: 'ONE_WAY' as const,
    tripLengthDays: null,
    currency: 'BRL',
  };

  it('um preço determinístico por dia do mês', async () => {
    const first = await provider.priceCalendar(calendarQuery);
    const second = await provider.priceCalendar(calendarQuery);
    expect(first).toHaveLength(28);
    expect(first[0]?.date).toBe('2027-02-01');
    expect(first.at(-1)?.date).toBe('2027-02-28');
    expect(first.map((day) => day.amountMinor)).toEqual(second.map((day) => day.amountMinor));
  });

  it('o preço do dia é o mesmo da busca daquele dia', async () => {
    const days = await provider.priceCalendar(calendarQuery);
    const result = await provider.search(
      {
        originIata: 'SAO',
        destinationIata: 'LIS',
        departureDate: '2027-02-10',
        returnDate: null,
        tripType: 'ONE_WAY',
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
      },
      { correlationId: 'c', searchExecutionId: 'e' },
    );
    if (result.kind !== 'offers') throw new Error('esperava oferta');
    expect(days.find((day) => day.date === '2027-02-10')?.amountMinor).toBe(
      result.offers[0]?.totalAmountMinor,
    );
  });

  it('todos os voos aponta para o host simulado da allowlist', () => {
    expect(
      provider.allFlightsUrl({
        originIata: 'SAO',
        destinationIata: 'LIS',
        departureDate: '2027-02-10',
        returnDate: null,
        tripType: 'ONE_WAY',
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
      }),
    ).toBe('https://booking.simulated-provider.flightwatch.dev/search/SAO-LIS-2027-02-10');
  });
});

describe('SimulatedFlightProvider.cheapestByDestination (SPEC-032 AC-1)', () => {
  const NOW = new Date('2026-10-07T12:00:00Z');
  const provider = new SimulatedFlightProvider(undefined, () => NOW);
  const fareQuery = {
    originIata: 'SAO',
    tripType: 'ONE_WAY' as const,
    currency: 'BRL',
    market: 'BR',
  };

  it('lista determinística, um preço por destino, sem a própria origem', async () => {
    const fares = (await provider.cheapestByDestination(fareQuery)) ?? [];
    expect(fares.length).toBeGreaterThan(5);
    expect(new Set(fares.map((fare) => fare.destinationIata)).size).toBe(fares.length);
    expect(fares.some((fare) => fare.destinationIata === 'SAO')).toBe(false);
    expect(await provider.cheapestByDestination(fareQuery)).toEqual(fares);
  });

  it('coerente com o calendário: o preço é o do dia e o menor da janela', async () => {
    const fares = await provider.cheapestByDestination(fareQuery);
    for (const fare of fares.slice(0, 3)) {
      const month = fare.departureDate.slice(0, 7);
      const days = await provider.priceCalendar({
        originIata: 'SAO',
        destinationIata: fare.destinationIata,
        month,
        tripType: 'ONE_WAY',
        tripLengthDays: null,
        currency: 'BRL',
      });
      const day = days.find((candidate) => candidate.date === fare.departureDate);
      expect(day?.amountMinor).toBe(fare.amountMinor);
      expect(fare.departureDate > '2026-10-07').toBe(true);
    }
  });

  it('ida e volta traz a data de volta', async () => {
    const fares = await provider.cheapestByDestination({ ...fareQuery, tripType: 'ROUND_TRIP' });
    expect(fares.every((fare) => fare.returnDate !== null)).toBe(true);
  });
});
