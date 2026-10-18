import { describe, expect, it } from 'vitest';
import { monthWindow } from './watch-quota-window.js';

describe('monthWindow (America/Campo_Grande, UTC-4)', () => {
  it('meio do mês: começa no dia 1 às 04:00Z e reinicia no dia 1 do mês seguinte', () => {
    const window = monthWindow(new Date('2026-10-17T15:00:00Z'));
    expect(window.start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(window.resetsAt.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('00:30 UTC do dia 1 ainda é o mês anterior em Campo Grande', () => {
    const window = monthWindow(new Date('2026-11-01T00:30:00Z'));
    expect(window.start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(window.resetsAt.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('04:00:00Z do dia 1 já é o mês novo', () => {
    const window = monthWindow(new Date('2026-11-01T04:00:00Z'));
    expect(window.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(window.resetsAt.toISOString()).toBe('2026-12-01T04:00:00.000Z');
  });

  it('vira o ano em dezembro', () => {
    const window = monthWindow(new Date('2026-12-20T12:00:00Z'));
    expect(window.start.toISOString()).toBe('2026-12-01T04:00:00.000Z');
    expect(window.resetsAt.toISOString()).toBe('2027-01-01T04:00:00.000Z');
  });
});
