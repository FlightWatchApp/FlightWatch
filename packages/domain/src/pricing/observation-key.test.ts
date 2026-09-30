import { describe, expect, it } from 'vitest';
import { computeObservationKey, computeObservedAtBucket } from './observation-key.js';

describe('computeObservedAtBucket', () => {
  it('buckets timestamps within the same minute together', () => {
    const a = computeObservedAtBucket(new Date('2026-12-20T10:05:10Z'));
    const b = computeObservedAtBucket(new Date('2026-12-20T10:05:59Z'));
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it('buckets timestamps across a minute boundary differently', () => {
    const a = computeObservedAtBucket(new Date('2026-12-20T10:05:59Z'));
    const b = computeObservedAtBucket(new Date('2026-12-20T10:06:00Z'));
    expect(a.toISOString()).not.toBe(b.toISOString());
  });
});

describe('computeObservationKey', () => {
  const observedAtBucket = computeObservedAtBucket(new Date('2026-12-20T10:05:10Z'));

  // AC-005 (SPEC-004): reprocessamento idêntico não duplica observação.
  it('is deterministic for the same inputs', () => {
    const input = {
      searchExecutionId: 'exec-1',
      offerSignature: 'sig-a',
      observedAtBucket,
      normalizerVersion: 1,
    };
    expect(computeObservationKey(input)).toBe(computeObservationKey(input));
  });

  it('differs when the selected offer signature differs', () => {
    const a = computeObservationKey({
      searchExecutionId: 'exec-1',
      offerSignature: 'sig-a',
      observedAtBucket,
      normalizerVersion: 1,
    });
    const b = computeObservationKey({
      searchExecutionId: 'exec-1',
      offerSignature: 'sig-b',
      observedAtBucket,
      normalizerVersion: 1,
    });
    expect(a).not.toBe(b);
  });

  it('differs when the normalizer version differs', () => {
    const a = computeObservationKey({
      searchExecutionId: 'exec-1',
      offerSignature: 'sig-a',
      observedAtBucket,
      normalizerVersion: 1,
    });
    const b = computeObservationKey({
      searchExecutionId: 'exec-1',
      offerSignature: 'sig-a',
      observedAtBucket,
      normalizerVersion: 2,
    });
    expect(a).not.toBe(b);
  });
});
