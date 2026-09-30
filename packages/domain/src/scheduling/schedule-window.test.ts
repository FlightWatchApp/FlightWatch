import { describe, expect, it } from 'vitest';
import {
  computeScheduleWindowStart,
  computeSearchExecutionIdempotencyKey,
} from './schedule-window.js';

describe('computeScheduleWindowStart', () => {
  it('buckets timestamps within the same 5-minute window to the same start', () => {
    const a = computeScheduleWindowStart(new Date('2026-12-20T10:05:10Z'));
    const b = computeScheduleWindowStart(new Date('2026-12-20T10:09:59Z'));
    expect(a.toISOString()).toBe(b.toISOString());
    expect(a.toISOString()).toBe('2026-12-20T10:05:00.000Z');
  });

  it('buckets timestamps across a 5-minute boundary to different windows', () => {
    const a = computeScheduleWindowStart(new Date('2026-12-20T10:09:59Z'));
    const b = computeScheduleWindowStart(new Date('2026-12-20T10:10:01Z'));
    expect(a.toISOString()).not.toBe(b.toISOString());
  });
});

describe('computeSearchExecutionIdempotencyKey', () => {
  const windowStart = computeScheduleWindowStart(new Date('2026-12-20T10:05:00Z'));

  // AC-001: mesmo target + mesma janela -> mesma chave, no máximo uma execução.
  it('is deterministic for the same target, window and strategy', () => {
    const a = computeSearchExecutionIdempotencyKey({
      searchTargetId: 'target-1',
      windowStart,
      providerStrategy: 'SIMULATED',
    });
    const b = computeSearchExecutionIdempotencyKey({
      searchTargetId: 'target-1',
      windowStart,
      providerStrategy: 'SIMULATED',
    });
    expect(a).toBe(b);
  });

  it('differs for a different target', () => {
    const a = computeSearchExecutionIdempotencyKey({
      searchTargetId: 'target-1',
      windowStart,
      providerStrategy: 'SIMULATED',
    });
    const b = computeSearchExecutionIdempotencyKey({
      searchTargetId: 'target-2',
      windowStart,
      providerStrategy: 'SIMULATED',
    });
    expect(a).not.toBe(b);
  });

  it('differs for a different window', () => {
    const otherWindow = computeScheduleWindowStart(new Date('2026-12-20T11:05:00Z'));
    const a = computeSearchExecutionIdempotencyKey({
      searchTargetId: 'target-1',
      windowStart,
      providerStrategy: 'SIMULATED',
    });
    const b = computeSearchExecutionIdempotencyKey({
      searchTargetId: 'target-1',
      windowStart: otherWindow,
      providerStrategy: 'SIMULATED',
    });
    expect(a).not.toBe(b);
  });
});
