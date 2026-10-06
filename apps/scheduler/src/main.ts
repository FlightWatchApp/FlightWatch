import { ConfigError, loadConfig, schedulerConfig } from '@flight-watch/config';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import { fetchTravelpayoutsPlaces } from '@flight-watch/providers';
import {
  createNotificationOutboxHandler,
  createNotificationQueue,
  createPriceCheckOutboxHandler,
  createPriceCheckQueue,
  createPriceObservedOutboxHandler,
  createPriceObservedQueue,
  createRedisConnection,
  publishPendingOutboxEvents,
} from '@flight-watch/queue';
import { createSchedulerMetrics } from './metrics.js';
import { PLACES_SOURCE_TIMEOUT_MS, runPlacesSync } from './places-sync.js';
import { runSchedulerTick } from './tick.js';

// SPEC-029: a decisão de baixar (vazio ou com 7 dias ou mais) é de
// runPlacesSync; este intervalo só define a frequência da verificação.
const PLACES_SYNC_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  // SPEC-024: configuração validada uma vez; inválida impede o startup.
  const config = loadConfig(schedulerConfig, process.env);
  const metrics = createSchedulerMetrics();
  const metricsServer = await startMetricsServer({
    registry: metrics.registry,
    port: config.METRICS_PORT,
    host: config.METRICS_HOST,
    isHealthy: () => true,
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);
  const priceCheckQueue = createPriceCheckQueue(connection);
  const priceObservedQueue = createPriceObservedQueue(connection);
  const notificationQueue = createNotificationQueue(connection);

  // Publisher genérico do outbox (ADR-003) — todo eventType com consumidor real
  // precisa de um handler aqui. WatchCreated.v1 ainda não tem (Identity, spec
  // futura); os três abaixo fecham o pipeline scheduler -> price-worker ->
  // alert-worker -> notification-worker.
  const outboxHandlers = {
    'PriceCheckRequested.v1': createPriceCheckOutboxHandler(priceCheckQueue),
    'PriceObserved.v1': createPriceObservedOutboxHandler(priceObservedQueue),
    'NotificationRequested.v1': createNotificationOutboxHandler(notificationQueue),
  };

  logEvent({
    event: 'scheduler_starting',
    appEnv: config.APP_ENV,
    tickIntervalMs: config.SCHEDULER_TICK_INTERVAL_MS,
    metricsPort: config.METRICS_PORT,
  });

  async function tick(): Promise<void> {
    try {
      const schedulerResult = await runSchedulerTick(prisma);
      metrics.targetsScannedTotal.inc(schedulerResult.targetsScanned);
      metrics.jobsCreatedTotal.inc(
        { result: 'success', reason: 'scheduled' },
        schedulerResult.scheduled,
      );
      metrics.reconciliationsTotal.inc({ reason: 'abandoned_lease' }, schedulerResult.reconciled);
      metrics.reconciliationsTotal.inc(
        { reason: 'retry_exhausted' },
        schedulerResult.retriesExhausted,
      );
      metrics.reconciliationsTotal.inc({ reason: 'watch_expired' }, schedulerResult.watchesExpired);

      // A criação dos jobs já foi commitada pela transação acima. Falha ao
      // publicar o outbox ou atualizar o gauge não transforma jobs criados em
      // "jobs failed"; são falhas de tick/publicação, métricas separadas.
      const publishResult = await publishPendingOutboxEvents(prisma, outboxHandlers);
      await metrics.refreshDelayedTargetsGauge(prisma);

      if (
        schedulerResult.scheduled > 0 ||
        publishResult.published > 0 ||
        schedulerResult.reconciled > 0 ||
        schedulerResult.retriesExhausted > 0 ||
        schedulerResult.watchesExpired > 0
      ) {
        logEvent({
          event: 'scheduler_tick_completed',
          reconciled: schedulerResult.reconciled,
          retriesExhausted: schedulerResult.retriesExhausted,
          watchesExpired: schedulerResult.watchesExpired,
          targetsScanned: schedulerResult.targetsScanned,
          scheduled: schedulerResult.scheduled,
          published: publishResult.published,
        });
      }
    } catch (error) {
      metrics.tickErrorsTotal.inc({ reason: 'tick_error' });
      logEvent({ event: 'scheduler_tick_failed', error });
    }
  }

  const interval = setInterval(() => void tick(), config.SCHEDULER_TICK_INTERVAL_MS);
  void tick();

  // SPEC-029: não bloqueia o agendamento; falha mantém o catálogo anterior.
  const syncPlaces = () =>
    runPlacesSync({
      prisma,
      fetchPlaces: () => fetchTravelpayoutsPlaces({ timeoutMs: PLACES_SOURCE_TIMEOUT_MS }),
      metrics,
      now: () => new Date(),
    });
  const placesInterval = setInterval(() => void syncPlaces(), PLACES_SYNC_CHECK_INTERVAL_MS);
  void syncPlaces();

  async function shutdown(): Promise<void> {
    logEvent({ event: 'scheduler_shutting_down' });
    clearInterval(interval);
    clearInterval(placesInterval);
    await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
    await priceCheckQueue.close();
    await priceObservedQueue.close();
    await notificationQueue.close();
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
      : { event: 'scheduler_startup_failed', error },
  );
  process.exit(1);
});
