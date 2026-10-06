import { Worker } from 'bullmq';
import { ConfigError, loadConfig, priceWorkerConfig } from '@flight-watch/config';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import {
  CircuitBreaker,
  TokenBucketRateLimiter,
  createFlightProvider,
} from '@flight-watch/providers';
import { QUEUE_NAMES, createRedisConnection } from '@flight-watch/queue';
import { createPriceWorkerMetrics } from './metrics.js';
import { processPriceCheckJob } from './process-job.js';

async function main(): Promise<void> {
  // SPEC-024: configuração validada uma vez; inválida impede o startup.
  const config = loadConfig(priceWorkerConfig, process.env);
  // ADR-004: provedor real entra atrás da mesma porta FlightProvider, escolhido
  // por FLIGHT_PROVIDER — nada mais neste arquivo muda.
  const provider = createFlightProvider(config.FLIGHT_PROVIDER);
  const rateLimiter = new TokenBucketRateLimiter(
    config.PRICE_WORKER_RATE_LIMIT_CAPACITY,
    config.PRICE_WORKER_RATE_LIMIT_PER_SECOND,
  );
  const circuitBreaker = new CircuitBreaker(
    config.PRICE_WORKER_CIRCUIT_FAILURE_THRESHOLD,
    config.PRICE_WORKER_CIRCUIT_RESET_TIMEOUT_MS,
  );
  const metrics = createPriceWorkerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: config.METRICS_PORT,
    host: config.METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);

  const worker = new Worker(
    QUEUE_NAMES.PRICE_CHECK,
    (job) => processPriceCheckJob({ prisma, provider, rateLimiter, circuitBreaker, metrics }, job),
    { connection, concurrency: config.PRICE_WORKER_CONCURRENCY },
  );

  logEvent({
    event: 'price_worker_starting',
    appEnv: config.APP_ENV,
    concurrency: config.PRICE_WORKER_CONCURRENCY,
    provider: provider.strategy,
    metricsPort: config.METRICS_PORT,
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
  logEvent(
    error instanceof ConfigError
      ? error.toLogEvent()
      : { event: 'price_worker_startup_failed', error },
  );
  process.exit(1);
});
