import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('stays closed and allows attempts before the failure threshold', () => {
    const breaker = new CircuitBreaker(3, 10_000);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canAttempt(0)).toBe(true);
  });

  it('opens after reaching the failure threshold and rejects attempts', () => {
    const breaker = new CircuitBreaker(3, 10_000);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canAttempt(1_000)).toBe(false);
  });

  it('moves to half-open after the reset timeout and allows one probe', () => {
    const breaker = new CircuitBreaker(2, 5_000);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    expect(breaker.canAttempt(4_000)).toBe(false);
    expect(breaker.canAttempt(5_000)).toBe(true);
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('closes again after a successful probe', () => {
    const breaker = new CircuitBreaker(2, 5_000);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    breaker.canAttempt(5_000);
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canAttempt(5_000)).toBe(true);
  });

  it('reopens immediately if the half-open probe fails', () => {
    const breaker = new CircuitBreaker(2, 5_000);
    breaker.recordFailure(0);
    breaker.recordFailure(0);
    breaker.canAttempt(5_000);
    breaker.recordFailure(5_000);
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canAttempt(9_000)).toBe(false);
  });
});
