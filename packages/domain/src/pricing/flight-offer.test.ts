import { describe, expect, it } from 'vitest';
import {
  type FlightOffer,
  type OfferEligibilityContext,
  buildOfferSignature,
  countEligibleOffers,
  isOfferEligible,
  offerConnectionsCount,
  offerDurationMinutes,
  selectBestOffer,
} from './flight-offer.js';

const context: OfferEligibilityContext = {
  originIata: 'DOU',
  destinationIata: 'GRU',
  currency: 'BRL',
  adults: 1,
  departureDate: '2026-12-20',
};

function offer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    providerOfferId: 'offer-1',
    totalAmountMinor: 100000,
    currency: 'BRL',
    passengerCount: 1,
    segments: [
      {
        originIata: 'DOU',
        destinationIata: 'GRU',
        departureAt: '2026-12-20T08:00:00Z',
        arrivalAt: '2026-12-20T10:00:00Z',
        carrier: 'G3',
      },
    ],
    observedAt: '2026-12-01T00:00:00Z',
    ...overrides,
  };
}

describe('isOfferEligible', () => {
  it('accepts an offer matching route, date, currency and passenger count', () => {
    expect(isOfferEligible(offer(), context)).toBe(true);
  });

  it.each([
    ['non-integer amount', { totalAmountMinor: 100.5 }],
    ['zero amount', { totalAmountMinor: 0 }],
    ['negative amount', { totalAmountMinor: -100 }],
    ['wrong currency', { currency: 'USD' }],
    ['wrong passenger count', { passengerCount: 2 }],
    ['no segments', { segments: [] }],
  ] satisfies Array<[string, Partial<FlightOffer>]>)(
    'rejects an offer with %s',
    (_label, overrides) => {
      expect(isOfferEligible(offer(overrides), context)).toBe(false);
    },
  );

  it('rejects an offer whose route does not match the search', () => {
    const mismatched = offer({
      segments: [
        {
          originIata: 'BSB',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T10:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(mismatched, context)).toBe(false);
  });

  // Regressão: oferta pra outra data não podia passar só porque origem/destino batiam.
  it('rejects an offer whose departure date does not match the search', () => {
    const wrongDate = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'GRU',
          departureAt: '2026-12-21T08:00:00Z',
          arrivalAt: '2026-12-21T10:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(wrongDate, context)).toBe(false);
  });

  it('rejects an offer whose segment arrives before it departs', () => {
    const invalid = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T10:00:00Z',
          arrivalAt: '2026-12-20T08:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(invalid, context)).toBe(false);
  });

  it('rejects a multi-segment offer whose connection does not match', () => {
    const brokenConnection = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'BSB',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T09:00:00Z',
          carrier: 'G3',
        },
        {
          originIata: 'CGH', // não bate com o destino do trecho anterior (BSB)
          destinationIata: 'GRU',
          departureAt: '2026-12-20T10:00:00Z',
          arrivalAt: '2026-12-20T11:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(brokenConnection, context)).toBe(false);
  });

  it('rejects a multi-segment offer whose next leg departs before the previous one arrives', () => {
    const timeTravel = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'BSB',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T09:00:00Z',
          carrier: 'G3',
        },
        {
          originIata: 'BSB',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T08:30:00Z', // antes da chegada do trecho anterior
          arrivalAt: '2026-12-20T11:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(timeTravel, context)).toBe(false);
  });

  // Regressão: só o originIata do primeiro trecho e o destinationIata do
  // último eram comparados contra a consulta — o aeroporto de conexão no meio
  // de um itinerário de 2+ trechos nunca era validado quanto a FORMATO, só
  // quanto a consistência interna (destino de um trecho == origem do
  // próximo). Um provedor podia devolver "" nos dois lados dessa conexão —
  // string vazia bate com string vazia — e a oferta passava mesmo assim.
  it('rejects a multi-segment offer whose connection airport is not a well-formed IATA code', () => {
    const malformedConnection = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: '',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T09:00:00Z',
          carrier: 'G3',
        },
        {
          originIata: '',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T10:00:00Z',
          arrivalAt: '2026-12-20T11:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(malformedConnection, context)).toBe(false);
  });

  it('rejects an offer whose connection airport is lowercase or the wrong length', () => {
    const lowercaseConnection = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'bsb',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T09:00:00Z',
          carrier: 'G3',
        },
        {
          originIata: 'bsb',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T10:00:00Z',
          arrivalAt: '2026-12-20T11:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(isOfferEligible(lowercaseConnection, context)).toBe(false);
  });

  it('rejects an offer that has already expired', () => {
    const expired = offer({ expiresAt: '2026-12-01T00:00:00Z' });
    expect(isOfferEligible(expired, { ...context, now: new Date('2026-12-05T00:00:00Z') })).toBe(
      false,
    );
  });

  it('accepts an offer that has not expired yet', () => {
    const stillValid = offer({ expiresAt: '2026-12-10T00:00:00Z' });
    expect(isOfferEligible(stillValid, { ...context, now: new Date('2026-12-05T00:00:00Z') })).toBe(
      true,
    );
  });
});

describe('offerDurationMinutes / offerConnectionsCount', () => {
  it('computes duration from first departure to last arrival', () => {
    expect(offerDurationMinutes(offer())).toBe(120);
  });

  it('counts connections as segments minus one', () => {
    expect(offerConnectionsCount(offer())).toBe(0);
    const withConnection = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'BSB',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T09:00:00Z',
          carrier: 'G3',
        },
        {
          originIata: 'BSB',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T10:00:00Z',
          arrivalAt: '2026-12-20T11:30:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(offerConnectionsCount(withConnection)).toBe(1);
  });
});

describe('selectBestOffer', () => {
  // EVAL-PRICE-001: ofertas de 1250, 970 e 1040 -> observação de 970.
  it('selects the lowest eligible total amount', () => {
    const offers = [
      offer({ providerOfferId: 'a', totalAmountMinor: 125000 }),
      offer({ providerOfferId: 'b', totalAmountMinor: 97000 }),
      offer({ providerOfferId: 'c', totalAmountMinor: 104000 }),
    ];
    const selected = selectBestOffer(offers, context);
    expect(selected?.offer.providerOfferId).toBe('b');
    expect(selected?.offer.totalAmountMinor).toBe(97000);
  });

  it('ignores ineligible offers even if cheaper', () => {
    const offers = [
      offer({ providerOfferId: 'cheap-wrong-currency', totalAmountMinor: 10000, currency: 'USD' }),
      offer({ providerOfferId: 'valid', totalAmountMinor: 97000 }),
    ];
    const selected = selectBestOffer(offers, context);
    expect(selected?.offer.providerOfferId).toBe('valid');
  });

  it('returns null when no offer is eligible (maps to no_offers, never price zero)', () => {
    const offers = [offer({ currency: 'USD' })];
    expect(selectBestOffer(offers, context)).toBeNull();
  });

  // EVAL-PRICE-006: empate de preço é resolvido de forma estável e determinística.
  it('breaks a price tie by shorter duration, then fewer connections, then signature', () => {
    const shortTrip = offer({
      providerOfferId: 'short',
      totalAmountMinor: 90000,
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T09:30:00Z',
          carrier: 'AD',
        },
      ],
    });
    const longTrip = offer({
      providerOfferId: 'long',
      totalAmountMinor: 90000,
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T12:00:00Z',
          carrier: 'G3',
        },
      ],
    });

    const first = selectBestOffer([longTrip, shortTrip], context);
    const second = selectBestOffer([shortTrip, longTrip], context);
    expect(first?.offer.providerOfferId).toBe('short');
    expect(second?.offer.providerOfferId).toBe('short');
  });
});

describe('countEligibleOffers', () => {
  it('counts only offers that pass isOfferEligible', () => {
    const eligible = offer();
    const wrongRoute = offer({
      segments: [
        {
          originIata: 'BSB',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T08:00:00Z',
          arrivalAt: '2026-12-20T10:00:00Z',
          carrier: 'G3',
        },
      ],
    });

    expect(countEligibleOffers([eligible, wrongRoute], context)).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    expect(countEligibleOffers([], context)).toBe(0);
  });

  it('never counts more than isOfferEligible would accept individually', () => {
    const offers = [offer(), offer(), offer()];
    const eligibleCount = countEligibleOffers(offers, context);
    const manualCount = offers.filter((o) => isOfferEligible(o, context)).length;
    expect(eligibleCount).toBe(manualCount);
  });
});

describe('buildOfferSignature', () => {
  it('is deterministic for the same itinerary', () => {
    expect(buildOfferSignature(offer())).toBe(buildOfferSignature(offer()));
  });

  it('differs when the itinerary differs', () => {
    const other = offer({
      segments: [
        {
          originIata: 'DOU',
          destinationIata: 'GRU',
          departureAt: '2026-12-20T09:00:00Z',
          arrivalAt: '2026-12-20T11:00:00Z',
          carrier: 'G3',
        },
      ],
    });
    expect(buildOfferSignature(offer())).not.toBe(buildOfferSignature(other));
  });
});
