import { describe, expect, it } from 'vitest';
import { resolveCurrentOfferStatus, resolvePurchaseUrl } from './purchase-link.js';

const VALID_URL = 'https://booking.simulated-provider.flightwatch.dev/checkout/abc123';

describe('resolvePurchaseUrl', () => {
  it('accepts a valid https URL on the allowed host for the provider', () => {
    expect(resolvePurchaseUrl(VALID_URL, 'SIMULATED')).toBe(VALID_URL);
  });

  it('returns null when deeplink is null or undefined', () => {
    expect(resolvePurchaseUrl(null, 'SIMULATED')).toBeNull();
    expect(resolvePurchaseUrl(undefined, 'SIMULATED')).toBeNull();
  });

  it('returns null when deeplink is an empty string', () => {
    expect(resolvePurchaseUrl('', 'SIMULATED')).toBeNull();
  });

  it('returns null for a provider with no allowlisted host', () => {
    expect(resolvePurchaseUrl(VALID_URL, 'SOME_FUTURE_PROVIDER')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(resolvePurchaseUrl('not-a-url', 'SIMULATED')).toBeNull();
  });

  it('returns null for a non-https scheme', () => {
    expect(
      resolvePurchaseUrl('http://booking.simulated-provider.flightwatch.dev/x', 'SIMULATED'),
    ).toBeNull();
  });

  it('returns null for javascript: and data: schemes', () => {
    expect(resolvePurchaseUrl('javascript:alert(1)', 'SIMULATED')).toBeNull();
    expect(resolvePurchaseUrl('data:text/html,evil', 'SIMULATED')).toBeNull();
  });

  it('returns null when the host does not match the allowlist for that provider', () => {
    expect(resolvePurchaseUrl('https://evil.example.com/checkout', 'SIMULATED')).toBeNull();
  });
});

describe('resolveCurrentOfferStatus', () => {
  it('is CURRENT when there is no expiresAt', () => {
    expect(resolveCurrentOfferStatus(null)).toBe('CURRENT');
  });

  it('is CURRENT when expiresAt is in the future', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    expect(resolveCurrentOfferStatus(new Date('2027-01-01T01:00:00Z'), now)).toBe('CURRENT');
  });

  it('is EXPIRED when expiresAt is in the past', () => {
    const now = new Date('2027-01-01T02:00:00Z');
    expect(resolveCurrentOfferStatus(new Date('2027-01-01T01:00:00Z'), now)).toBe('EXPIRED');
  });

  it('is EXPIRED when expiresAt equals now exactly', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    expect(resolveCurrentOfferStatus(new Date('2027-01-01T00:00:00Z'), now)).toBe('EXPIRED');
  });
});
