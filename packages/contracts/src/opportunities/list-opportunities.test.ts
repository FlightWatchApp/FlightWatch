import { describe, expect, it } from 'vitest';
import {
  listOpportunitiesQuerySchema,
  listOpportunitiesResponseSchema,
} from './list-opportunities.js';

describe('listOpportunitiesQuerySchema', () => {
  it('accepts an empty query and applies the default sort', () => {
    const result = listOpportunitiesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('best_value');
    }
  });

  it('coerces maxPriceMinor/maxStops from query-string strings', () => {
    const result = listOpportunitiesQuerySchema.safeParse({
      maxPriceMinor: '50000',
      maxStops: '1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxPriceMinor).toBe(50_000);
      expect(result.data.maxStops).toBe(1);
    }
  });

  it('normalizes origin/destination to uppercase', () => {
    const result = listOpportunitiesQuerySchema.safeParse({ origin: 'dou', destination: 'gru' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.origin).toBe('DOU');
      expect(result.data.destination).toBe('GRU');
    }
  });

  it('rejects a malformed IATA code', () => {
    const result = listOpportunitiesQuerySchema.safeParse({ origin: 'DOUR' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid sort value', () => {
    const result = listOpportunitiesQuerySchema.safeParse({ sort: 'cheapest' });
    expect(result.success).toBe(false);
  });

  it('rejects maxStops out of the 0-3 range', () => {
    const result = listOpportunitiesQuerySchema.safeParse({ maxStops: '4' });
    expect(result.success).toBe(false);
  });
});

describe('listOpportunitiesResponseSchema', () => {
  it('accepts a well-formed response', () => {
    const response = {
      opportunities: [
        {
          searchTargetId: '11111111-1111-1111-1111-111111111111',
          origin: 'DOU',
          destination: 'GRU',
          originName: 'Dourados',
          destinationName: 'São Paulo',
          originCoordinates: { lat: -22.2, lng: -54.9 },
          destinationCoordinates: null,
          tripType: 'ONE_WAY',
          market: 'BR',
          departureDate: '2027-03-01',
          returnDate: null,
          deal: {
            dealType: 'HISTORICAL_LOW',
            referenceAmountMinor: 60_000,
            currentAmountMinor: 60_000,
            currency: 'BRL',
            dropPercent: null,
            confidence: 'MEDIUM',
            observationCount: 5,
            explanation: 'Menor preço já observado para esta rota',
            validFrom: '2027-01-01T00:00:00.000Z',
            validUntil: null,
          },
          offer: {
            amountMinor: 60_000,
            currency: 'BRL',
            purchaseUrl: 'https://booking.simulated-provider.flightwatch.dev/checkout/x',
            provider: 'SIMULATED',
            observedAt: '2027-01-01T00:00:00.000Z',
            expiresAt: null,
            status: 'CURRENT',
            segments: [
              {
                originIata: 'DOU',
                destinationIata: 'GRU',
                departureAt: '2027-03-01T08:00:00Z',
                arrivalAt: '2027-03-01T10:30:00Z',
                carrier: 'SIM',
              },
            ],
            fareSummary: null,
            durationMinutes: 150,
            connectionsCount: 0,
          },
        },
      ],
      total: 1,
    };
    expect(listOpportunitiesResponseSchema.safeParse(response).success).toBe(true);

    // SPEC-030: oferta-resumo (cache de preços) — sem trechos, duração pode faltar.
    const [first] = response.opportunities;
    if (!first) throw new Error('fixture sem oferta');
    const summary = {
      ...response,
      opportunities: [
        {
          ...first,
          offer: {
            ...first.offer,
            segments: [],
            fareSummary: {
              departureDate: '2026-12-20',
              returnDate: null,
              stops: 1,
              durationMinutes: null,
            },
            durationMinutes: null,
            connectionsCount: 1,
          },
        },
      ],
    };
    expect(listOpportunitiesResponseSchema.safeParse(summary).success).toBe(true);
  });
});
