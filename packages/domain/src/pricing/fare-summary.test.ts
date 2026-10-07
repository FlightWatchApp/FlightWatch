import { describe, expect, it } from 'vitest';
import {
  type FlightOffer,
  buildOfferSignature,
  isOfferEligible,
  offerConnectionsCount,
  offerDurationMinutes,
  selectBestOffer,
} from './flight-offer.js';
import { parseStoredItinerary, toStoredItinerary } from './stored-itinerary.js';

const now = new Date('2026-10-06T12:00:00Z');

function summaryOffer(overrides: Partial<FlightOffer> = {}, summary = {}): FlightOffer {
  return {
    providerOfferId: 'tp-1',
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
      ...summary,
    },
    observedAt: '2026-10-06T04:53:47Z',
    expiresAt: '2026-10-09T04:53:47Z',
    ...overrides,
  };
}

const context = {
  originIata: 'SAO',
  destinationIata: 'NYC',
  currency: 'BRL',
  adults: 1,
  departureDate: '2026-11-17',
  returnDate: null,
  now,
};

describe('resumo de tarifa — elegibilidade (SPEC-030 AC-5)', () => {
  it('é elegível para a rota, o dia e a volta pedidos', () => {
    expect(isOfferEligible(summaryOffer(), context)).toBe(true);
  });

  it.each([
    ['outra origem', {}, { originCode: 'RIO' }],
    ['outro destino', {}, { destinationCode: 'MIA' }],
    ['outro dia', {}, { departureDate: '2026-11-18' }],
    ['volta diferente da pedida', {}, { returnDate: '2026-11-25' }],
    ['escalas negativas', {}, { stops: -1 }],
    ['duração não positiva', {}, { durationMinutes: 0 }],
    ['preço zero', { totalAmountMinor: 0 }, {}],
    ['outra moeda', { currency: 'USD' }, {}],
    ['vencida', { expiresAt: '2026-10-06T11:59:59Z' }, {}],
  ])('rejeita %s', (_label, overrides, summary) => {
    expect(isOfferEligible(summaryOffer(overrides, summary), context)).toBe(false);
  });

  it('ida e volta exige a mesma data de volta', () => {
    const roundTrip = { ...context, returnDate: '2026-11-25' };
    expect(isOfferEligible(summaryOffer({}, { returnDate: '2026-11-25' }), roundTrip)).toBe(true);
    expect(isOfferEligible(summaryOffer(), roundTrip)).toBe(false);
  });

  it('oferta com trechos e resumo ao mesmo tempo é inelegível', () => {
    const both = summaryOffer({
      segments: [
        {
          originIata: 'SAO',
          destinationIata: 'NYC',
          departureAt: '2026-11-17T08:00:00Z',
          arrivalAt: '2026-11-17T20:00:00Z',
          carrier: 'XX',
        },
      ],
    });
    expect(isOfferEligible(both, context)).toBe(false);
  });

  it('contexto sem returnDate (chamadores antigos) não exige a volta', () => {
    const { returnDate: _ignored, ...legacy } = context;
    expect(_ignored).toBeNull();
    expect(isOfferEligible(summaryOffer(), legacy)).toBe(true);
  });
});

describe('resumo de tarifa — seleção e derivados', () => {
  it('escalas e duração vêm do resumo', () => {
    expect(offerConnectionsCount(summaryOffer())).toBe(1);
    expect(offerDurationMinutes(summaryOffer())).toBe(785);
    expect(offerDurationMinutes(summaryOffer({}, { durationMinutes: null }))).toBeNull();
  });

  it('assinatura identifica rota, dia, volta, escalas e duração', () => {
    expect(buildOfferSignature(summaryOffer())).toBe('FARE|SAO|NYC|2026-11-17|-|1|785');
  });

  it('escolhe o menor preço; no empate, quem tem duração vence quem não tem', () => {
    const cheap = summaryOffer({ providerOfferId: 'a', totalAmountMinor: 200_000 });
    const expensive = summaryOffer({ providerOfferId: 'b', totalAmountMinor: 300_000 });
    expect(selectBestOffer([expensive, cheap], context)?.offer.providerOfferId).toBe('a');

    const noDuration = summaryOffer(
      { providerOfferId: 'sem-duracao', totalAmountMinor: 200_000 },
      { durationMinutes: null },
    );
    expect(selectBestOffer([noDuration, cheap], context)?.offer.providerOfferId).toBe('a');
  });
});

describe('itinerário gravado (SPEC-030 AC-6)', () => {
  it('resumo grava com kind FARE_SUMMARY e volta igual', () => {
    const offer = summaryOffer();
    const stored = toStoredItinerary(offer);
    expect(stored).toEqual({ kind: 'FARE_SUMMARY', ...offer.fareSummary });
    expect(parseStoredItinerary(JSON.parse(JSON.stringify(stored)))).toEqual({
      kind: 'FARE_SUMMARY',
      summary: offer.fareSummary,
    });
  });

  it('trechos continuam gravados como lista e a lista antiga é lida', () => {
    const segments = [
      {
        originIata: 'DOU',
        destinationIata: 'GRU',
        departureAt: '2026-12-20T08:00:00Z',
        arrivalAt: '2026-12-20T10:30:00Z',
        carrier: 'SIM',
      },
    ];
    const offer = summaryOffer({ segments });
    delete offer.fareSummary;
    expect(toStoredItinerary(offer)).toEqual(segments);
    expect(parseStoredItinerary(segments)).toEqual({ kind: 'SEGMENTS', segments });
  });

  it('formato desconhecido é rejeitado', () => {
    expect(() => parseStoredItinerary({ kind: 'OUTRO' })).toThrow(/itinerary/);
    expect(() => parseStoredItinerary('texto')).toThrow(/itinerary/);
    expect(() => parseStoredItinerary({ kind: 'FARE_SUMMARY', originCode: 'SAO' })).toThrow(
      /itinerary/,
    );
  });
});
