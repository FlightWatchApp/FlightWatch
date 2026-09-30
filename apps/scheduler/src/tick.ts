import { randomUUID } from 'node:crypto';
import {
  type PrismaClient,
  createScheduledSearchExecution,
  reconcileAbandonedSearchExecutions,
  reconcileExhaustedRetries,
  reconcileExpiredWatches,
  selectEligibleSearchTargetsForUpdate,
} from '@flight-watch/database';
import {
  SCHEDULE_WINDOW_MINUTES,
  computeScheduleWindowStart,
  computeSearchExecutionIdempotencyKey,
} from '@flight-watch/domain';
import type { PriceCheckRequestedJob } from '@flight-watch/queue';

export interface SchedulerTickOptions {
  batchSize?: number;
  abandonedLeaseTimeoutMs?: number;
  retryExhaustionTimeoutMs?: number;
}

export interface SchedulerTickResult {
  reconciled: number;
  retriesExhausted: number;
  watchesExpired: number;
  /** SPEC-002 §11: `scheduler_targets_scanned_total` — elegíveis encontrados, antes de tentar criar job pra cada um. */
  targetsScanned: number;
  /** SPEC-002 §11: `scheduler_jobs_created_total{result="success"}`. */
  scheduled: number;
}

const DEFAULT_BATCH_SIZE = 100;
// Timeout de lease abandonada bem maior que qualquer chamada real ao provedor
// simulado deveria levar — placeholder até existir dado real de latência de
// provedor (Fase 5) para calibrar.
const DEFAULT_ABANDONED_LEASE_TIMEOUT_MS = 10 * 60_000;
// Folga generosa sobre a janela de retry do BullMQ (5 tentativas, backoff
// exponencial a partir de 2s — packages/queue's RETRYABLE_JOB_OPTIONS, ~30s de
// janela total). 2 minutos garante que nenhuma redelivery legítima ainda em
// andamento seja confundida com uma retentativa esgotada.
const DEFAULT_RETRY_EXHAUSTION_TIMEOUT_MS = 2 * 60_000;

/**
 * Um tick do scheduler (SPEC-002 §5): reconcilia execuções abandonadas e
 * retentativas esgotadas, expira Watches vencidos, seleciona targets
 * elegíveis com lock (`FOR UPDATE SKIP LOCKED`), cria uma SearchExecution
 * `scheduled` para cada um e grava `PriceCheckRequested.v1` no outbox — tudo numa
 * única transação. Publicar o outbox na fila é responsabilidade de outra função
 * (o publisher genérico de `packages/queue`), chamada separadamente pelo caller.
 */
export async function runSchedulerTick(
  prisma: PrismaClient,
  options: SchedulerTickOptions = {},
): Promise<SchedulerTickResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const abandonedLeaseTimeoutMs =
    options.abandonedLeaseTimeoutMs ?? DEFAULT_ABANDONED_LEASE_TIMEOUT_MS;
  const retryExhaustionTimeoutMs =
    options.retryExhaustionTimeoutMs ?? DEFAULT_RETRY_EXHAUSTION_TIMEOUT_MS;

  return prisma.$transaction(async (tx) => {
    const reconciled = await reconcileAbandonedSearchExecutions(tx, abandonedLeaseTimeoutMs);
    const retriesExhausted = await reconcileExhaustedRetries(tx, retryExhaustionTimeoutMs);
    const watchesExpired = await reconcileExpiredWatches(tx);
    const eligible = await selectEligibleSearchTargetsForUpdate(tx, batchSize);

    const now = new Date();
    const windowStart = computeScheduleWindowStart(now);
    const windowEnd = new Date(windowStart.getTime() + SCHEDULE_WINDOW_MINUTES * 60_000);

    let scheduled = 0;
    for (const target of eligible) {
      const idempotencyKey = computeSearchExecutionIdempotencyKey({
        searchTargetId: target.id,
        windowStart,
        providerStrategy: target.providerStrategy,
      });
      const correlationId = randomUUID();

      await createScheduledSearchExecution(tx, {
        searchTargetId: target.id,
        providerStrategy: target.providerStrategy,
        idempotencyKey,
        correlationId,
      });

      const job: PriceCheckRequestedJob = {
        schemaVersion: 1,
        jobId: randomUUID(),
        idempotencyKey,
        correlationId,
        searchTargetId: target.id,
        scheduleWindow: `${windowStart.toISOString()}/${windowEnd.toISOString()}`,
        requestedAt: now.toISOString(),
      };

      await tx.outboxEvent.create({
        data: { eventType: 'PriceCheckRequested.v1', payload: { ...job } },
      });

      scheduled += 1;
    }

    return {
      reconciled,
      retriesExhausted,
      watchesExpired,
      targetsScanned: eligible.length,
      scheduled,
    };
  });
}
