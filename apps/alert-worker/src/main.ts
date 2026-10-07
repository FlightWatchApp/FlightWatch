import { Worker } from 'bullmq';
import { ConfigError, alertWorkerConfig, loadConfig } from '@flight-watch/config';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import { QUEUE_NAMES, createRedisConnection } from '@flight-watch/queue';
import { evaluatePriceObservedJob } from './evaluate.js';
import { createAlertWorkerMetrics } from './metrics.js';

async function main(): Promise<void> {
  // SPEC-024: configuração validada uma vez; inválida impede o startup.
  const config = loadConfig(alertWorkerConfig, process.env);
  const metrics = createAlertWorkerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: config.METRICS_PORT,
    host: config.METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);

  const worker = new Worker(
    QUEUE_NAMES.PRICE_OBSERVED,
    (job) => evaluatePriceObservedJob({ prisma, metrics }, job),
    { connection, concurrency: config.ALERT_WORKER_CONCURRENCY },
  );

  logEvent({
    event: 'alert_worker_starting',
    appEnv: config.APP_ENV,
    concurrency: config.ALERT_WORKER_CONCURRENCY,
    metricsPort: config.METRICS_PORT,
  });

  worker.on('failed', (job, err) => {
    logEvent({
      event: 'alert_worker_job_failed',
      jobId: job?.id ?? 'unknown',
      correlationId: job?.data?.correlationId,
      error: err,
    });
  });

  async function shutdown(): Promise<void> {
    logEvent({ event: 'alert_worker_shutting_down' });
    await worker.close();
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
      : { event: 'alert_worker_startup_failed', error },
  );
  process.exit(1);
});
