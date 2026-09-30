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
