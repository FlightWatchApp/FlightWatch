import {
  Counter,
  Histogram,
  createMetricsRegistry,
  type Registry,
} from '@flight-watch/observability';

/** ADR-007 / SPEC-005 §14. */
export interface AlertWorkerMetrics {
  registry: Registry;
  rulesEvaluatedTotal: Counter<'type' | 'result'>;
  eventsTotal: Counter<'outcome'>;
  eventLagSeconds: Histogram<never>;
  pagesProcessedTotal: Counter<never>;
  watchSkippedTotal: Counter<'reason'>;
}

export function createAlertWorkerMetrics(): AlertWorkerMetrics {
  const registry = createMetricsRegistry();

  const rulesEvaluatedTotal = new Counter({
    name: 'alert_rules_evaluated_total',
    help: 'Regras avaliadas por tipo/resultado — triggered/not_triggered/no_reference (SPEC-005 §14).',
    labelNames: ['type', 'result'],
    registers: [registry],
  });

  const eventsTotal = new Counter({
    name: 'alert_events_total',
    help: 'AlertEvents por desfecho — queued/suppressed/idempotent_replay (SPEC-005 §14).',
    labelNames: ['outcome'],
    registers: [registry],
  });

  const eventLagSeconds = new Histogram({
    name: 'alert_event_lag_seconds',
    help: 'De PriceObserved.observedAt até o AlertEvent ser criado (SPEC-005 §14).',
    registers: [registry],
  });

  const pagesProcessedTotal = new Counter({
    name: 'alert_worker_pages_processed_total',
    help: 'Páginas de Watches processadas por job PriceObserved (SPEC-005 §14).',
    registers: [registry],
  });

  const watchSkippedTotal = new Counter({
    name: 'alert_worker_watch_skipped_total',
    help: 'Watches pulados na avaliação, por motivo (SPEC-005 §14).',
    labelNames: ['reason'],
    registers: [registry],
  });

  return {
    registry,
    rulesEvaluatedTotal,
    eventsTotal,
    eventLagSeconds,
    pagesProcessedTotal,
    watchSkippedTotal,
  };
}
