import { createHash } from 'node:crypto';

export type TripType = 'ONE_WAY' | 'ROUND_TRIP';
export type Cabin = 'ECONOMY';

export interface SearchTargetCanonicalInputV1 {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  tripType: TripType;
  cabin: Cabin;
  adults: number;
  currency: string;
  market: string;
}

export class InvalidSearchTargetInputError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidSearchTargetInputError';
  }
}

const SCHEMA_VERSION = 'v1';
const IATA_PATTERN = /^[A-Za-z]{3}$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeIata(value: string, field: string): string {
  const normalized = value.trim().toUpperCase();
  if (!IATA_PATTERN.test(normalized)) {
    throw new InvalidSearchTargetInputError(
      `${field} must be a 3-letter IATA code, received: "${value}"`,
    );
  }
  return normalized;
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized)) {
    throw new InvalidSearchTargetInputError(
      `currency must be a 3-letter code, received: "${value}"`,
    );
  }
  return normalized;
}

function normalizeMarket(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new InvalidSearchTargetInputError('market must not be empty');
  }
  return normalized;
}

function normalizeDate(value: string, field: string): string {
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    throw new InvalidSearchTargetInputError(
      `${field} must be an ISO date (YYYY-MM-DD), received: "${value}"`,
    );
  }
  return trimmed;
}

function assertTripConsistency(
  tripType: TripType,
  departureDate: string,
  returnDate: string | null,
): void {
  if (tripType === 'ONE_WAY' && returnDate !== null) {
    throw new InvalidSearchTargetInputError('ONE_WAY trips must not have a returnDate');
  }
  if (tripType === 'ROUND_TRIP') {
    if (returnDate === null) {
      throw new InvalidSearchTargetInputError('ROUND_TRIP trips require a returnDate');
    }
    if (returnDate <= departureDate) {
      throw new InvalidSearchTargetInputError('returnDate must be after departureDate');
    }
  }
}

/**
 * Chave canônica v1 (ADR-005 / DOMAIN.md §3.4). Função pura: mesma entrada
 * semântica sempre produz a mesma string, independente de casing/espaçamento.
 */
export function buildCanonicalKeyV1(input: SearchTargetCanonicalInputV1): string {
  const origin = normalizeIata(input.origin, 'origin');
  const destination = normalizeIata(input.destination, 'destination');
  if (origin === destination) {
    throw new InvalidSearchTargetInputError('origin and destination must differ');
  }

  const departureDate = normalizeDate(input.departureDate, 'departureDate');
  const returnDate =
    input.returnDate === null ? null : normalizeDate(input.returnDate, 'returnDate');
  assertTripConsistency(input.tripType, departureDate, returnDate);

  if (!Number.isInteger(input.adults) || input.adults < 1) {
    throw new InvalidSearchTargetInputError(
      `adults must be a positive integer, received: ${input.adults}`,
    );
  }

  const currency = normalizeCurrency(input.currency);
  const market = normalizeMarket(input.market);

  return [
    `schema=${SCHEMA_VERSION}`,
    `origin=${origin}`,
    `destination=${destination}`,
    `departure=${departureDate}`,
    `return=${returnDate ?? '-'}`,
    `trip=${input.tripType}`,
    `cabin=${input.cabin}`,
    `adults=${input.adults}`,
    `currency=${currency}`,
    `market=${market}`,
  ].join('|');
}

export function fingerprintCanonicalKey(canonicalKey: string): string {
  return createHash('sha256').update(canonicalKey).digest('hex');
}

export interface SearchTargetFingerprintV1 {
  canonicalKey: string;
  fingerprint: string;
}

export function computeSearchTargetFingerprintV1(
  input: SearchTargetCanonicalInputV1,
): SearchTargetFingerprintV1 {
  const canonicalKey = buildCanonicalKeyV1(input);
  return { canonicalKey, fingerprint: fingerprintCanonicalKey(canonicalKey) };
}
