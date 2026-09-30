import { Counter, Gauge, createMetricsRegistry, type Registry } from '@flight-watch/observability';
import { type PrismaClient, countDelayedSearchTargetsByPriority } from '@flight-watch/database';

/** ADR-007 / SPEC-002 §11. Nomes literais do spec, sem prefixo. */
export interface SchedulerMetrics {
  registry: Registry;
  targetsScannedTotal: Counter<string>;
  jobsCreatedTotal: Counter<'result' | 'reason'>;
  tickErrorsTotal: Counter<'reason'>;
  /** SPEC-002 §11: "leases expiradas e reconciliadas" — `reason` é abandoned_lease/retry_exhausted/watch_expired. */
  reconciliationsTotal: Counter<'reason'>;
  targetsDelayed: Gauge<'priority'>;
  refreshDelayedTargetsGauge: (prisma: PrismaClient) => Promise<void>;
}

export function createSchedulerMetrics(): SchedulerMetrics {
  const registry = createMetricsRegistry();

  const targetsScannedTotal = new Counter({
    name: 'scheduler_targets_scanned_total',
    help: 'Total de SearchTargets selecionados pelo scheduler por tick (SPEC-002 §11).',
    registers: [registry],
  });

  const jobsCreatedTotal = new Counter({
    name: 'scheduler_jobs_created_total',
    help: 'Total de PriceCheckRequested.v1 realmente criados, por resultado (SPEC-002 §11).',
    labelNames: ['result', 'reason'],
    registers: [registry],
  });

  const tickErrorsTotal = new Counter({
    name: 'scheduler_tick_errors_total',
    help: 'Total de ticks do scheduler que falharam após iniciar o processamento.',
    labelNames: ['reason'],
    registers: [registry],
  });

  const reconciliationsTotal = new Counter({
    name: 'scheduler_reconciliations_total',
    help: 'Leases/execuções/Watches reconciliados por tick, por motivo (SPEC-002 §11).',
    labelNames: ['reason'],
    registers: [registry],
  });

  const targetsDelayed = new Gauge({
    name: 'scheduler_targets_delayed',
    help: 'SearchTargets elegíveis aguardando verificação agora, por classe de prioridade (SPEC-002 §11).',
    labelNames: ['priority'],
    registers: [registry],
  });

  async function refreshDelayedTargetsGauge(prisma: PrismaClient): Promise<void> {
    const rows = await countDelayedSearchTargetsByPriority(prisma);
    targetsDelayed.reset();
    for (const row of rows) {
      const normalizedPriority = row.priority.trim().toUpperCase();
      const priority = ['STANDARD', 'HIGH', 'LOW'].includes(normalizedPriority)
        ? normalizedPriority
        : 'OTHER';
      targetsDelayed.set({ priority }, Number(row.count));
    }
  }

  return {
    registry,
    targetsScannedTotal,
    jobsCreatedTotal,
    tickErrorsTotal,
    reconciliationsTotal,
    targetsDelayed,
    refreshDelayedTargetsGauge,
  };
}
