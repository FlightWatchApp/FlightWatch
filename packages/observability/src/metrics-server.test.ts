import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Counter } from '@prometheus-io/client';
import { createMetricsRegistry } from './registry.js';
import { startMetricsServer } from './metrics-server.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
  server = undefined;
});

function baseUrl(): string {
  const address = server?.address();
  if (!address || typeof address === 'string') {
    throw new Error('server not listening on a port');
  }
  return `http://127.0.0.1:${address.port}`;
}

describe('startMetricsServer', () => {
  it('exposes registered metrics in Prometheus text format on /metrics', async () => {
    const registry = createMetricsRegistry('metrics_server_test_');
    const counter = new Counter({
      name: 'metrics_server_test_hits_total',
      help: 'test counter',
      registers: [registry],
    });
    counter.inc(3);

    server = await startMetricsServer({ registry, port: 0, host: '127.0.0.1' });
    const response = await fetch(`${baseUrl()}/metrics`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('metrics_server_test_hits_total 3');
  });

  it('returns 200 ok on /health by default', async () => {
    const registry = createMetricsRegistry('health_default_test_');
    server = await startMetricsServer({ registry, port: 0, host: '127.0.0.1' });

    const response = await fetch(`${baseUrl()}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 on /health when isHealthy reports false', async () => {
    const registry = createMetricsRegistry('health_unhealthy_test_');
    server = await startMetricsServer({
      registry,
      port: 0,
      host: '127.0.0.1',
      isHealthy: () => false,
    });

    const response = await fetch(`${baseUrl()}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
  });

  it('returns 404 for any other path', async () => {
    const registry = createMetricsRegistry('not_found_test_');
    server = await startMetricsServer({ registry, port: 0, host: '127.0.0.1' });

    const response = await fetch(`${baseUrl()}/nope`);
    expect(response.status).toBe(404);
  });
});
