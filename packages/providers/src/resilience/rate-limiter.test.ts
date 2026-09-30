import { describe, expect, it } from 'vitest';
import { TokenBucketRateLimiter } from './rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  it('allows up to capacity requests immediately', () => {
    const limiter = new TokenBucketRateLimiter(3, 1, 0);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(0)).toBe(false);
  });

  it('refills tokens over time at the configured rate', () => {
    const limiter = new TokenBucketRateLimiter(1, 1, 0);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(500)).toBe(false);
    expect(limiter.tryAcquire(1000)).toBe(true);
  });

  it('never exceeds capacity even after a long idle period', () => {
    const limiter = new TokenBucketRateLimiter(2, 10, 0);
    expect(limiter.tryAcquire(1_000_000)).toBe(true);
    expect(limiter.tryAcquire(1_000_000)).toBe(true);
    expect(limiter.tryAcquire(1_000_000)).toBe(false);
  });
});
