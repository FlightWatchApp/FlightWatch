import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  InvalidSearchTargetInputError,
  type SearchTargetCanonicalInputV1,
  buildCanonicalKeyV1,
  computeSearchTargetFingerprintV1,
  fingerprintCanonicalKey,
} from './canonical-key.js';

const baseInput: SearchTargetCanonicalInputV1 = {
  origin: 'DOU',
  destination: 'GRU',
  departureDate: '2026-12-20',
  returnDate: null,
  tripType: 'ONE_WAY',
  cabin: 'ECONOMY',
  adults: 1,
  currency: 'BRL',
  market: 'BR',
};

describe('buildCanonicalKeyV1', () => {
  it('builds the exact key format documented in DOMAIN.md §3.4', () => {
    expect(buildCanonicalKeyV1(baseInput)).toBe(
      'schema=v1|origin=DOU|destination=GRU|departure=2026-12-20|return=-|trip=ONE_WAY|cabin=ECONOMY|adults=1|currency=BRL|market=BR',
    );
  });

  it('includes the return date for round trips', () => {
    const key = buildCanonicalKeyV1({
      ...baseInput,
      tripType: 'ROUND_TRIP',
      returnDate: '2026-12-27',
    });
    expect(key).toContain('return=2026-12-27');
    expect(key).toContain('trip=ROUND_TRIP');
  });

  // EVAL-DEDUP-004: a versão do schema faz parte da chave, então uma futura v2
  // precisa mudar esta string deliberadamente para fragmentar os targets.
  it('pins the schema version as part of the key', () => {
    expect(buildCanonicalKeyV1(baseInput)).toMatch(/^schema=v1\|/);
  });

  // EVAL-DEDUP-002: diferença material (data) produz chave diferente.
  it('produces a different key when departureDate differs', () => {
    const keyA = buildCanonicalKeyV1(baseInput);
    const keyB = buildCanonicalKeyV1({ ...baseInput, departureDate: '2026-12-21' });
    expect(keyA).not.toBe(keyB);
  });

  // EVAL-DEDUP-003: normalização de casing/espaçamento não fragmenta o target.
  it('normalizes casing and whitespace to the same key', () => {
    const messyInput: SearchTargetCanonicalInputV1 = {
      ...baseInput,
      origin: ' dou ',
      destination: 'gru',
      currency: 'brl',
      market: ' br ',
    };
    expect(buildCanonicalKeyV1(messyInput)).toBe(buildCanonicalKeyV1(baseInput));
  });

  it('rejects origin equal to destination', () => {
    expect(() => buildCanonicalKeyV1({ ...baseInput, destination: 'DOU' })).toThrow(
      InvalidSearchTargetInputError,
    );
  });

  it.each(['DO', 'DOUR', '123', ''])('rejects malformed IATA code: %s', (origin) => {
    expect(() => buildCanonicalKeyV1({ ...baseInput, origin })).toThrow(
      InvalidSearchTargetInputError,
    );
  });

  it('rejects ONE_WAY input carrying a returnDate', () => {
    expect(() =>
      buildCanonicalKeyV1({ ...baseInput, tripType: 'ONE_WAY', returnDate: '2026-12-27' }),
    ).toThrow(InvalidSearchTargetInputError);
  });

  it('rejects ROUND_TRIP input missing a returnDate', () => {
    expect(() =>
      buildCanonicalKeyV1({ ...baseInput, tripType: 'ROUND_TRIP', returnDate: null }),
    ).toThrow(InvalidSearchTargetInputError);
  });

  it('rejects a returnDate on or before departureDate', () => {
    expect(() =>
      buildCanonicalKeyV1({
        ...baseInput,
        tripType: 'ROUND_TRIP',
        returnDate: '2026-12-20',
      }),
    ).toThrow(InvalidSearchTargetInputError);
  });

  it.each([0, -1, 1.5])('rejects a non-positive-integer adults count: %s', (adults) => {
    expect(() => buildCanonicalKeyV1({ ...baseInput, adults })).toThrow(
      InvalidSearchTargetInputError,
    );
  });

  it.each(['R', 'BRLL', '12A'])('rejects a malformed currency code: %s', (currency) => {
    expect(() => buildCanonicalKeyV1({ ...baseInput, currency })).toThrow(
      InvalidSearchTargetInputError,
    );
  });

  it('rejects an empty market', () => {
    expect(() => buildCanonicalKeyV1({ ...baseInput, market: '   ' })).toThrow(
      InvalidSearchTargetInputError,
    );
  });

  it('rejects a malformed date', () => {
    expect(() => buildCanonicalKeyV1({ ...baseInput, departureDate: '20-12-2026' })).toThrow(
      InvalidSearchTargetInputError,
    );
  });
});

describe('fingerprintCanonicalKey', () => {
  it('is deterministic', () => {
    const key = buildCanonicalKeyV1(baseInput);
    expect(fingerprintCanonicalKey(key)).toBe(fingerprintCanonicalKey(key));
  });

  it('produces a 64-character hex SHA-256 digest', () => {
    const fingerprint = fingerprintCanonicalKey(buildCanonicalKeyV1(baseInput));
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('computeSearchTargetFingerprintV1', () => {
  // EVAL-DEDUP-001: 100 usuários com a mesma busca devem convergir para 1 SearchTarget.
  it('produces the same fingerprint for 100 equivalent watch requests', () => {
    const fingerprints = new Set(
      Array.from({ length: 100 }, () => computeSearchTargetFingerprintV1(baseInput).fingerprint),
    );
    expect(fingerprints.size).toBe(1);
  });
});

describe('property: normalization is idempotent under whitespace/casing', () => {
  const iataArbitrary = fc
    .constantFrom('DOU', 'GRU', 'GIG', 'CGH', 'BSB')
    .chain((code) =>
      fc.constantFrom(code, code.toLowerCase(), ` ${code} `, ` ${code.toLowerCase()} `),
    );

  it('origin/destination casing and padding never change the canonical key', () => {
    fc.assert(
      fc.property(iataArbitrary, iataArbitrary, (rawOrigin, rawDestination) => {
        fc.pre(rawOrigin.trim().toUpperCase() !== rawDestination.trim().toUpperCase());
        const normalizedInput: SearchTargetCanonicalInputV1 = {
          ...baseInput,
          origin: rawOrigin.trim().toUpperCase(),
          destination: rawDestination.trim().toUpperCase(),
        };
        const messyInput: SearchTargetCanonicalInputV1 = {
          ...baseInput,
          origin: rawOrigin,
          destination: rawDestination,
        };
        expect(buildCanonicalKeyV1(messyInput)).toBe(buildCanonicalKeyV1(normalizedInput));
      }),
    );
  });
});

describe('property: any change to departureDate changes the fingerprint', () => {
  it('never collides for two different departure dates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 27 }),
        fc.integer({ min: 1, max: 27 }),
        (dayA, dayB) => {
          fc.pre(dayA !== dayB);
          const pad = (n: number) => String(n).padStart(2, '0');
          const fingerprintA = computeSearchTargetFingerprintV1({
            ...baseInput,
            departureDate: `2026-12-${pad(dayA)}`,
          }).fingerprint;
          const fingerprintB = computeSearchTargetFingerprintV1({
            ...baseInput,
            departureDate: `2026-12-${pad(dayB)}`,
          }).fingerprint;
          expect(fingerprintA).not.toBe(fingerprintB);
        },
      ),
    );
  });
});
