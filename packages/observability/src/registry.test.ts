import { describe, expect, it } from 'vitest';
import { createMetricsRegistry } from './registry.js';

describe('createMetricsRegistry', () => {
  it('collects default process metrics under the given prefix', async () => {
    const registry = createMetricsRegistry('test_prefix_');
    const body = await registry.metrics();
    expect(body).toContain('test_prefix_process_cpu_user_seconds_total');
  });

  it('defaults to the flight_watch_ prefix', async () => {
    const registry = createMetricsRegistry();
    const body = await registry.metrics();
    expect(body).toContain('flight_watch_process_cpu_user_seconds_total');
  });

  it('returns an independent registry per call (no cross-process leakage)', async () => {
    const first = createMetricsRegistry('independent_a_');
    const second = createMetricsRegistry('independent_b_');
    const firstBody = await first.metrics();
    const secondBody = await second.metrics();
    expect(firstBody).not.toContain('independent_b_');
    expect(secondBody).not.toContain('independent_a_');
  });
});
