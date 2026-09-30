import {
  Counter,
  Gauge,
  Histogram,
  createMetricsRegistry,
  type Registry,
} from '@flight-watch/observability';

/**
 * ADR-007 / SPEC-003 §11 / SPEC-004 §12. Cota/custo ficam fora do escopo
 * enquanto só existe o provedor SIMULATED (ver SPEC-003 §11).
 */
export interface PriceWorkerMetrics {
  registry: Registry;
  providerCallTotal: Counter<'provider' | 'result'>;
  providerCallDurationSeconds: Histogram<'provider'>;
  offersReceivedTotal: Counter<string>;
  offersEligibleTotal: Counter<string>;
  circuitBreakerOpen: Gauge<'provider'>;
  /** SPEC-004 §12: `price_observation_total{result}`. */
  priceObservationTotal: Counter<'result'>;
  /** SPEC-011 §8: `search_execution_stale_lease_rejections_total{action}`. */
  staleLeaseRejectionsTotal: Counter<'action'>;
}

export function createPriceWorkerMetrics(): PriceWorkerMetrics {
  const registry = createMetricsRegistry();

  const providerCallTotal = new Counter({
    name: 'provider_call_total',
    help: 'Chamadas ao provedor de voos, por provider/resultado (SPEC-003 §11).',
    labelNames: ['provider', 'result'],
    registers: [registry],
  });

  const providerCallDurationSeconds = new Histogram({
    name: 'provider_call_duration_seconds',
    help: 'Latência de chamadas que efetivamente saíram pro provedor (SPEC-003 §11).',
    labelNames: ['provider'],
    registers: [registry],
  });

  const offersReceivedTotal = new Counter({
    name: 'offers_received_total',
    help: 'Total de ofertas recebidas do provedor, sem filtrar elegibilidade (SPEC-003 §11).',
    registers: [registry],
  });

  const offersEligibleTotal = new Counter({
    name: 'offers_eligible_total',
    help: 'Total de ofertas que passaram isOfferEligible — a diferença pro received é "rejeitadas" (SPEC-003 §11).',
    registers: [registry],
  });

  const circuitBreakerOpen = new Gauge({
    name: 'circuit_breaker_open',
    help: '1 quando o circuit breaker está aberto (não aceita tentativas), 0 caso contrário (SPEC-003 §11).',
    labelNames: ['provider'],
    registers: [registry],
  });

  const priceObservationTotal = new Counter({
    name: 'price_observation_total',
    help: 'Total de resultados de busca de preço persistidos, por resultado (SPEC-004 §12).',
    labelNames: ['result'],
    registers: [registry],
  });

  const staleLeaseRejectionsTotal = new Counter({
    name: 'search_execution_stale_lease_rejections_total',
    help: 'Escritas terminais de SearchExecution rejeitadas por lease obsoleto, por ação (SPEC-011 §8).',
    labelNames: ['action'],
    registers: [registry],
  });

  return {
    registry,
    providerCallTotal,
    providerCallDurationSeconds,
    offersReceivedTotal,
    offersEligibleTotal,
    circuitBreakerOpen,
    priceObservationTotal,
    staleLeaseRejectionsTotal,
  };
}
