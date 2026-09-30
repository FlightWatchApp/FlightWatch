import { Worker } from 'bullmq';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import { QUEUE_NAMES, createRedisConnection } from '@flight-watch/queue';
import { evaluatePriceObservedJob } from './evaluate.js';
import { createAlertWorkerMetrics } from './metrics.js';

const CONCURRENCY = Number(process.env.ALERT_WORKER_CONCURRENCY ?? 5);
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9103);
const METRICS_HOST = process.env.METRICS_HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const metrics = createAlertWorkerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: METRICS_PORT,
    host: METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient();
  const connection = createRedisConnection();

  const worker = new Worker(
    QUEUE_NAMES.PRICE_OBSERVED,
    (job) => evaluatePriceObservedJob({ prisma, metrics }, job),
    { connection, concurrency: CONCURRENCY },
  );

  logEvent({ event: 'alert_worker_starting', concurrency: CONCURRENCY, metricsPort: METRICS_PORT });

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
  logEvent({ event: 'alert_worker_startup_failed', error });
  process.exit(1);
});
