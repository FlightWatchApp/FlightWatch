import { randomUUID } from 'node:crypto';
import { Worker } from 'bullmq';
import { ConfigError, loadConfig, notificationWorkerConfig } from '@flight-watch/config';
import {
  createPrismaClient,
  reconcileStaleSendingNotificationDeliveries,
} from '@flight-watch/database';
import { createEmailSender } from '@flight-watch/notifications';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import {
  QUEUE_NAMES,
  createNotificationQueue,
  createRedisConnection,
  type NotificationRequestedJob,
} from '@flight-watch/queue';
import { buildWatchManagementUrl } from './links.js';
import { createNotificationWorkerMetrics } from './metrics.js';
import { processNotificationJob } from './process-job.js';

// SPEC-006: mesmo valor de ALERT_EMAIL_TEMPLATE_VERSION — usado só quando uma
// entrega presa em SENDING foi criada antes de `templateVersion` existir
// (migração aditiva, coluna nullable).
const DEFAULT_TEMPLATE_VERSION = 1;

async function main(): Promise<void> {
  // SPEC-024: configuração validada uma vez; inválida impede o startup.
  const config = loadConfig(notificationWorkerConfig, process.env);
  const staleSendingThresholdMs = config.NOTIFICATION_STALE_SENDING_THRESHOLD_MS;

  function buildUnsubscribeUrl(watchId: string): string {
    return buildWatchManagementUrl(config.WEB_BASE_URL, watchId);
  }

  const metrics = createNotificationWorkerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: config.METRICS_PORT,
    host: config.METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);
  const notificationQueue = createNotificationQueue(connection);
  // Canal real (SMTP/SES/Resend/etc.) entra atrás da mesma porta EmailSender,
  // escolhido por EMAIL_PROVIDER — nada mais neste arquivo muda.
  const emailSender = createEmailSender(config.EMAIL_PROVIDER);

  const worker = new Worker(
    QUEUE_NAMES.NOTIFICATION,
    (job) =>
      processNotificationJob(
        { prisma, emailSender, buildUnsubscribeUrl, metrics, staleSendingThresholdMs },
        job,
      ),
    { connection, concurrency: config.NOTIFICATION_WORKER_CONCURRENCY },
  );

  logEvent({
    event: 'notification_worker_starting',
    appEnv: config.APP_ENV,
    concurrency: config.NOTIFICATION_WORKER_CONCURRENCY,
    metricsPort: config.METRICS_PORT,
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
        reconcileStaleSendingNotificationDeliveries(tx, staleSendingThresholdMs),
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
    config.NOTIFICATION_STALE_SENDING_SWEEP_INTERVAL_MS,
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
  logEvent(
    error instanceof ConfigError
      ? error.toLogEvent()
      : { event: 'notification_worker_startup_failed', error },
  );
  process.exit(1);
});
