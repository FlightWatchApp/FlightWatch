import { describe, expect, it } from 'vitest';
import { formatDate, isStale } from './freshness.js';

describe('formatDate', () => {
  // Regressão: sem timeZone: 'UTC', 'pt-BR' formatava em fuso local e uma data
  // pura como '2027-01-01' virava "31 de dezembro de 2026" em qualquer fuso
  // negativo (ex.: America/Campo_Grande, UTC-4).
  it('does not shift the day regardless of the runtime local timezone', () => {
    expect(formatDate('2027-01-01')).toContain('1');
    expect(formatDate('2027-01-01')).not.toContain('31');
    expect(formatDate('2027-01-01')).toContain('2027');
  });

  it('formats a mid-month date correctly', () => {
    const formatted = formatDate('2026-12-20');
    expect(formatted).toContain('20');
    expect(formatted).toContain('dez');
  });
});

describe('isStale', () => {
  it('treats a null last check as stale', () => {
    expect(isStale(null)).toBe(true);
  });

  it('is not stale within the freshness window', () => {
    const now = new Date('2026-12-20T12:00:00Z');
    const lastCheck = new Date('2026-12-20T00:00:00Z').toISOString();
    expect(isStale(lastCheck, now)).toBe(false);
  });

  it('is stale past the freshness window', () => {
    const now = new Date('2026-12-25T00:00:00Z');
    const lastCheck = new Date('2026-12-20T00:00:00Z').toISOString();
    expect(isStale(lastCheck, now)).toBe(true);
  });
});
