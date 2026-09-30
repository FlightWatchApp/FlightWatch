import {
  Counter,
  Histogram,
  createMetricsRegistry,
  type Registry,
} from '@flight-watch/observability';

/** ADR-007 / SPEC-006 §12. */
export interface NotificationWorkerMetrics {
  registry: Registry;
  deliveriesTotal: Counter<'channel' | 'status' | 'templateVersion'>;
  deliveryLagSeconds: Histogram<'channel'>;
  deliveryAttemptsTotal: Counter<'channel'>;
  duplicateDeliveriesPreventedTotal: Counter<never>;
  /** SPEC-012 §7. */
  staleSendingRecoveredTotal: Counter<never>;
}

export function createNotificationWorkerMetrics(): NotificationWorkerMetrics {
  const registry = createMetricsRegistry();

  const deliveriesTotal = new Counter({
    name: 'notification_deliveries_total',
    help: 'Entregas por canal/status/versão de template — delivered/retryable_failure/permanent_failure (SPEC-006 §12).',
    labelNames: ['channel', 'status', 'templateVersion'],
    registers: [registry],
  });

  const deliveryLagSeconds = new Histogram({
    name: 'notification_delivery_lag_seconds',
    help: 'De AlertEvent.createdAt até a entrega ser resolvida (SPEC-006 §12).',
    labelNames: ['channel'],
    registers: [registry],
  });

  const deliveryAttemptsTotal = new Counter({
    name: 'notification_delivery_attempts_total',
    help: 'Tentativas de envio reivindicadas, por canal (SPEC-006 §12).',
    labelNames: ['channel'],
    registers: [registry],
  });

  const duplicateDeliveriesPreventedTotal = new Counter({
    name: 'notification_duplicate_deliveries_prevented_total',
    help: 'Reivindicações recusadas por já haver entrega em andamento/resolvida (SPEC-006 §12).',
    registers: [registry],
  });

  const staleSendingRecoveredTotal = new Counter({
    name: 'notification_stale_sending_recovered_total',
    help: 'Entregas presas em SENDING reconciliadas e reenfileiradas (SPEC-012 §7).',
    registers: [registry],
  });

  return {
    registry,
    deliveriesTotal,
    deliveryLagSeconds,
    deliveryAttemptsTotal,
    duplicateDeliveriesPreventedTotal,
    staleSendingRecoveredTotal,
  };
}
