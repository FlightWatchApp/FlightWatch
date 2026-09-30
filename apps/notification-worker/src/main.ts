import { randomUUID } from 'node:crypto';
import { Worker } from 'bullmq';
import {
  createPrismaClient,
  reconcileStaleSendingNotificationDeliveries,
} from '@flight-watch/database';
import { InMemoryEmailSender } from '@flight-watch/notifications';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import {
  QUEUE_NAMES,
  createNotificationQueue,
  createRedisConnection,
  type NotificationRequestedJob,
} from '@flight-watch/queue';
import { createNotificationWorkerMetrics } from './metrics.js';
import { STALE_SENDING_THRESHOLD_MS, processNotificationJob } from './process-job.js';

const CONCURRENCY = Number(process.env.NOTIFICATION_WORKER_CONCURRENCY ?? 5);
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9104);
const METRICS_HOST = process.env.METRICS_HOST ?? '127.0.0.1';
// SPEC-012 §4: cadência do laço de reconciliação — independente do intervalo
// de staleness em si (STALE_SENDING_THRESHOLD_MS).
const STALE_SENDING_SWEEP_INTERVAL_MS = Number(
  process.env.NOTIFICATION_STALE_SENDING_SWEEP_INTERVAL_MS ?? 60_000,
);
// SPEC-006: mesmo valor de ALERT_EMAIL_TEMPLATE_VERSION — usado só quando uma
// entrega presa em SENDING foi criada antes de `templateVersion` existir
// (migração aditiva, coluna nullable).
const DEFAULT_TEMPLATE_VERSION = 1;

function buildUnsubscribeUrl(watchId: string): string {
  return `${APP_BASE_URL}/watches/${watchId}/preferences`;
}

async function main(): Promise<void> {
  const metrics = createNotificationWorkerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: METRICS_PORT,
    host: METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient();
  const connection = createRedisConnection();
  const notificationQueue = createNotificationQueue(connection);
  // Canal real (SMTP/SES/Resend/etc.) entra aqui atrás da mesma porta EmailSender
  // quando existir — SPEC-006 não define o fornecedor ainda (§2: e-mail é só a
  // baseline técnica), nada mais neste arquivo muda quando isso for decidido.
  const emailSender = new InMemoryEmailSender();

  const worker = new Worker(
    QUEUE_NAMES.NOTIFICATION,
    (job) => processNotificationJob({ prisma, emailSender, buildUnsubscribeUrl, metrics }, job),
    { connection, concurrency: CONCURRENCY },
  );

  logEvent({
    event: 'notification_worker_starting',
    concurrency: CONCURRENCY,
    metricsPort: METRICS_PORT,
  });

  worker.on('failed', (job, err) => {
    logEvent({
      event: 'notification_worker_job_failed',
      jobId: job?.id ?? 'unknown',
      correlationId: job?.data?.correlationId,
      error: err,
    });
  });

  /**
   * SPEC-012 §4: laço independente do Worker do BullMQ — cobre o caso de o
   * job original nunca ser redelivered pelo próprio BullMQ (ex.: já tinha
   * sido marcado concluído do lado da fila antes do crash). Reenfileira com
   * um `eventId`/`correlationId` novos (é uma nova tentativa lógica), mas o
   * mesmo `alertEventId`/`channel`/`templateVersion` — o `deliveryKey`
   * resultante é o mesmo, então a idempotência do EmailSender (SPEC-012 §3)
   * cobre a hipótese de o envio original já ter saído.
   */
  async function sweepStaleSendingDeliveries(): Promise<void> {
    try {
      const stale = await prisma.$transaction((tx) =>
        reconcileStaleSendingNotificationDeliveries(tx, STALE_SENDING_THRESHOLD_MS),
      );
      for (const delivery of stale) {
        const job: NotificationRequestedJob = {
          eventId: randomUUID(),
          alertEventId: delivery.alertEventId,
          channel: delivery.channel,
          templateVersion: delivery.templateVersion ?? DEFAULT_TEMPLATE_VERSION,
          correlationId: randomUUID(),
        };
        await notificationQueue.add(QUEUE_NAMES.NOTIFICATION, job, { jobId: job.eventId });
        metrics.staleSendingRecoveredTotal.inc();
        logEvent({
          event: 'notification_stale_sending_recovered',
          notificationDeliveryId: delivery.id,
          alertEventId: delivery.alertEventId,
          correlationId: job.correlationId,
        });
      }
    } catch (error) {
      logEvent({ event: 'notification_stale_sending_sweep_failed', error });
    }
  }

  const staleSweepInterval = setInterval(
    () => void sweepStaleSendingDeliveries(),
    STALE_SENDING_SWEEP_INTERVAL_MS,
  );
  void sweepStaleSendingDeliveries();

  async function shutdown(): Promise<void> {
    logEvent({ event: 'notification_worker_shutting_down' });
    clearInterval(staleSweepInterval);
    await worker.close();
    await notificationQueue.close();
    await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main().catch((error: unknown) => {
  logEvent({ event: 'notification_worker_startup_failed', error });
  process.exit(1);
});
