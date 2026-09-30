import { Registry, collectDefaultMetrics } from '@prometheus-io/client';

/**
 * ADR-007: cada processo mantém seu próprio Registry, sem agregação entre
 * processos nesta fase. `collectDefaultMetrics` adiciona CPU/memória/event
 * loop lag de graça — sinal básico de saúde do processo sem código extra.
 */
export function createMetricsRegistry(prefix = 'flight_watch_'): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix });
  return registry;
}
