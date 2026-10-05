import { describe, expect, it } from 'vitest';
import {
  formatAbsoluteDateTime,
  formatDate,
  formatFlightTime,
  formatRemainingDuration,
  isOfferExpired,
  isStale,
} from './freshness.js';

describe('formatFlightTime', () => {
  // CP-16/PG-04: um voo às 11:00Z mostra 08:00 e o rótulo "horários de
  // Brasília" (adicionado no componente) — Brasília é UTC-3.
  it('formats in DISPLAY_TIME_ZONE (Brasília), regardless of the process timezone', () => {
    expect(formatFlightTime('2026-09-30T11:00:00Z')).toBe('08:00');
  });
});

describe('isOfferExpired', () => {
  const now = new Date('2026-09-30T12:00:00Z');

  it('is false when expiresAt is absent', () => {
    expect(isOfferExpired(null, now)).toBe(false);
  });

  it('is false when the validity window is still open', () => {
    expect(isOfferExpired('2026-09-30T13:00:00Z', now)).toBe(false);
  });

  it('is true when the validity window has passed', () => {
    expect(isOfferExpired('2026-09-30T11:00:00Z', now)).toBe(true);
  });
});

describe('formatRemainingDuration', () => {
  const now = new Date('2026-09-30T12:00:00Z');

  it('formats minutes below one hour', () => {
    expect(formatRemainingDuration('2026-09-30T12:45:00Z', now)).toBe('45 minutos');
  });

  it('formats hours below one day, always numeric (never "amanhã")', () => {
    expect(formatRemainingDuration('2026-09-30T14:00:00Z', now)).toBe('2 horas');
  });

  it('uses singular for exactly one unit', () => {
    expect(formatRemainingDuration('2026-09-30T13:00:00Z', now)).toBe('1 hora');
    expect(formatRemainingDuration('2026-09-30T12:01:00Z', now)).toBe('1 minuto');
  });

  it('clamps a past instant to zero instead of a negative duration', () => {
    expect(formatRemainingDuration('2026-09-30T11:00:00Z', now)).toBe('1 minuto');
  });
});

describe('formatAbsoluteDateTime', () => {
  // DS-07/EVAL-UI-TIME-001: independente do fuso do processo Node que roda o
  // teste (ou do servidor em produção) — sempre no fuso fixo de exibição,
  // nunca no fuso local do ambiente.
  it('formats in DISPLAY_TIME_ZONE regardless of the process timezone', () => {
    expect(formatAbsoluteDateTime('2026-09-30T15:44:00Z')).toBe('30/09/2026, 12:44');
  });
});

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
