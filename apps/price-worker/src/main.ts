import { Worker } from 'bullmq';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import {
  CircuitBreaker,
  SimulatedFlightProvider,
  TokenBucketRateLimiter,
} from '@flight-watch/providers';
import { QUEUE_NAMES, createRedisConnection } from '@flight-watch/queue';
import { createPriceWorkerMetrics } from './metrics.js';
import { processPriceCheckJob } from './process-job.js';

const CONCURRENCY = Number(process.env.PRICE_WORKER_CONCURRENCY ?? 5);
const RATE_LIMIT_CAPACITY = Number(process.env.PRICE_WORKER_RATE_LIMIT_CAPACITY ?? 10);
const RATE_LIMIT_PER_SECOND = Number(process.env.PRICE_WORKER_RATE_LIMIT_PER_SECOND ?? 5);
const CIRCUIT_FAILURE_THRESHOLD = Number(process.env.PRICE_WORKER_CIRCUIT_FAILURE_THRESHOLD ?? 5);
const CIRCUIT_RESET_TIMEOUT_MS = Number(
  process.env.PRICE_WORKER_CIRCUIT_RESET_TIMEOUT_MS ?? 30_000,
);
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9102);
const METRICS_HOST = process.env.METRICS_HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  // ADR-004: provedor real entra aqui atrás da mesma porta FlightProvider,
  // quando existir — nada mais neste arquivo muda.
  const provider = new SimulatedFlightProvider();
  const rateLimiter = new TokenBucketRateLimiter(RATE_LIMIT_CAPACITY, RATE_LIMIT_PER_SECOND);
  const circuitBreaker = new CircuitBreaker(CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_RESET_TIMEOUT_MS);
  const metrics = createPriceWorkerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: METRICS_PORT,
    host: METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient();
  const connection = createRedisConnection();

  const worker = new Worker(
    QUEUE_NAMES.PRICE_CHECK,
    (job) => processPriceCheckJob({ prisma, provider, rateLimiter, circuitBreaker, metrics }, job),
    { connection, concurrency: CONCURRENCY },
  );

  logEvent({
    event: 'price_worker_starting',
    concurrency: CONCURRENCY,
    provider: provider.strategy,
    metricsPort: METRICS_PORT,
  });

  worker.on('failed', (job, err) => {
    logEvent({
      event: 'price_worker_job_failed',
      jobId: job?.id ?? 'unknown',
      correlationId: job?.data?.correlationId,
      error: err,
    });
  });

  async function shutdown(): Promise<void> {
    logEvent({ event: 'price_worker_shutting_down' });
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
  logEvent({ event: 'price_worker_startup_failed', error });
  process.exit(1);
});
