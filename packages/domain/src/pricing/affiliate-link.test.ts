import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_UTM_SOURCE,
  applyAffiliateTracking,
  parseAffiliateTrackingConfig,
} from './affiliate-link.js';

const PURCHASE_URL = 'https://booking.simulated-provider.flightwatch.dev/checkout/GRU%7CMIA';

describe('parseAffiliateTrackingConfig', () => {
  it('returns an empty, valid config when the variable is absent or blank', () => {
    expect(parseAffiliateTrackingConfig(undefined)).toEqual({ ok: true, config: {} });
    expect(parseAffiliateTrackingConfig('')).toEqual({ ok: true, config: {} });
    expect(parseAffiliateTrackingConfig('   ')).toEqual({ ok: true, config: {} });
  });

  it('parses params per providerStrategy', () => {
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"marker":"123456"}}')).toEqual({
      ok: true,
      config: { SIMULATED: { marker: '123456' } },
    });
  });

  it('rejects malformed JSON without throwing', () => {
    expect(parseAffiliateTrackingConfig('{not valid')).toEqual({ ok: false, config: {} });
  });

  it('rejects a root that is not an object', () => {
    expect(parseAffiliateTrackingConfig('[1,2,3]')).toEqual({ ok: false, config: {} });
    expect(parseAffiliateTrackingConfig('"string"')).toEqual({ ok: false, config: {} });
  });

  it('rejects a provider value that is not an object', () => {
    expect(parseAffiliateTrackingConfig('{"SIMULATED":"marker=123456"}')).toEqual({
      ok: false,
      config: {},
    });
  });

  it('rejects keys or values outside the safe charset', () => {
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"a key":"1"}}').ok).toBe(false);
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"marker":"a&b=c"}}').ok).toBe(false);
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"marker":"a/b"}}').ok).toBe(false);
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"marker":""}}').ok).toBe(false);
  });

  it('rejects a reserved utm_* key', () => {
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"utm_source":"other"}}').ok).toBe(false);
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"utm_medium":"other"}}').ok).toBe(false);
    expect(parseAffiliateTrackingConfig('{"SIMULATED":{"utm_campaign":"other"}}').ok).toBe(false);
  });
});

describe('applyAffiliateTracking', () => {
  it('appends provider params plus utm attribution for the surface', () => {
    const url = new URL(
      applyAffiliateTracking(PURCHASE_URL, 'SIMULATED', 'WATCH', {
        SIMULATED: { marker: '123456' },
      }),
    );
    expect(url.hostname).toBe('booking.simulated-provider.flightwatch.dev');
    expect(url.pathname).toBe('/checkout/GRU%7CMIA');
    expect(url.searchParams.get('marker')).toBe('123456');
    expect(url.searchParams.get('utm_source')).toBe(AFFILIATE_UTM_SOURCE);
    expect(url.searchParams.get('utm_medium')).toBe('affiliate');
    expect(url.searchParams.get('utm_campaign')).toBe('watch');
  });

  it('preserves query params already present on the link', () => {
    const url = new URL(
      applyAffiliateTracking(`${PURCHASE_URL}?fare=Y`, 'SIMULATED', 'OPPORTUNITY', {
        SIMULATED: { marker: '123456' },
      }),
    );
    expect(url.searchParams.get('fare')).toBe('Y');
    expect(url.searchParams.get('utm_campaign')).toBe('opportunity');
  });

  it('returns the URL unchanged when the provider has no configured params', () => {
    expect(applyAffiliateTracking(PURCHASE_URL, 'SIMULATED', 'SEARCH', {})).toBe(PURCHASE_URL);
    expect(
      applyAffiliateTracking(PURCHASE_URL, 'UNCONFIGURED_PROVIDER', 'SEARCH', {
        SIMULATED: { marker: '1' },
      }),
    ).toBe(PURCHASE_URL);
  });

  it('returns the value unchanged when it is not a parseable URL', () => {
    expect(
      applyAffiliateTracking('not-a-url', 'SIMULATED', 'SEARCH', { SIMULATED: { marker: '1' } }),
    ).toBe('not-a-url');
  });

  it('never lets the configured params override the utm attribution keys', () => {
    const url = new URL(
      applyAffiliateTracking(PURCHASE_URL, 'SIMULATED', 'WATCH', {
        SIMULATED: { marker: '123456' },
      }),
    );
    expect(url.searchParams.getAll('utm_source')).toEqual([AFFILIATE_UTM_SOURCE]);
  });
});
