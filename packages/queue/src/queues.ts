import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { OutboxEventHandler } from './outbox-publisher.js';

export const QUEUE_NAMES = {
  PRICE_CHECK: 'price-check',
  PRICE_OBSERVED: 'price-observed',
  NOTIFICATION: 'notification',
} as const;

// SPEC-002 §3: contrato mínimo do job — só IDs e metadados, nunca payload
// completo do provedor nem dado pessoal.
export interface PriceCheckRequestedJob {
  schemaVersion: 1;
  jobId: string;
  idempotencyKey: string;
  correlationId: string;
  searchTargetId: string;
  scheduleWindow: string;
  requestedAt: string;
}

export function createPriceCheckQueue(connection: Redis): Queue<PriceCheckRequestedJob> {
  return new Queue<PriceCheckRequestedJob>(QUEUE_NAMES.PRICE_CHECK, { connection });
}

// SPEC-003 §6 / SPEC-005 / SPEC-006: "retry limitado" para timeout/5xx/rate-limit
// em qualquer uma das três filas. BullMQ cuida do agendamento (backoff
// exponencial); cada worker só decide se relança (retentável) ou não
// (permanente). Não honra o `Retry-After` exato do provedor ainda (usaria
// job.moveToDelayed); todo retentável usa este mesmo backoff por enquanto.
const RETRYABLE_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

/**
 * Adapta a fila para o formato que o publisher do outbox espera. `jobId` usa a
 * própria idempotencyKey do SearchExecution — BullMQ não cria um job duplicado
 * enquanto o original ainda está na fila/ativo, reforçando (não substituindo) a
 * constraint única do Postgres.
 */
export function createPriceCheckOutboxHandler(
  queue: Queue<PriceCheckRequestedJob>,
): OutboxEventHandler {
  return async (payload) => {
    const job = payload as PriceCheckRequestedJob;
    await queue.add(QUEUE_NAMES.PRICE_CHECK, job, {
      jobId: job.idempotencyKey,
      ...RETRYABLE_JOB_OPTIONS,
    });
  };
}

// SPEC-004 §10: evento gerado ao persistir uma observação de preço; consumido
// pelo Alert Engine (apps/alert-worker) para avaliar as regras dos Watches.
export interface PriceObservedJob {
  eventId: string;
  searchTargetId: string;
  priceObservationId: string;
  amountMinor: number;
  currency: string;
  observedAt: string;
  selectionPolicyVersion: number;
  correlationId: string;
}

export function createPriceObservedQueue(connection: Redis): Queue<PriceObservedJob> {
  return new Queue<PriceObservedJob>(QUEUE_NAMES.PRICE_OBSERVED, { connection });
}

export function createPriceObservedOutboxHandler(
  queue: Queue<PriceObservedJob>,
): OutboxEventHandler {
  return async (payload) => {
    const job = payload as PriceObservedJob;
    await queue.add(QUEUE_NAMES.PRICE_OBSERVED, job, {
      jobId: job.eventId,
      ...RETRYABLE_JOB_OPTIONS,
    });
  };
}

// SPEC-005 §12: IDs, tipo de canal e versão do template — nunca o destino
// pessoal no payload da fila (o notification-worker resolve o destino atual
// a partir do AlertEvent/Watch/NotificationChannel).
export interface NotificationRequestedJob {
  eventId: string;
  alertEventId: string;
  channel: 'EMAIL';
  templateVersion: number;
  correlationId: string;
}

export function createNotificationQueue(connection: Redis): Queue<NotificationRequestedJob> {
  return new Queue<NotificationRequestedJob>(QUEUE_NAMES.NOTIFICATION, { connection });
}

export function createNotificationOutboxHandler(
  queue: Queue<NotificationRequestedJob>,
): OutboxEventHandler {
  return async (payload) => {
    const job = payload as NotificationRequestedJob;
    await queue.add(QUEUE_NAMES.NOTIFICATION, job, {
      jobId: job.eventId,
      ...RETRYABLE_JOB_OPTIONS,
    });
  };
}
