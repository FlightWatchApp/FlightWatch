import 'reflect-metadata';
import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import { AppModule } from './app.module.js';
import { registerCorrelationHook } from './observability/correlation.js';
import { MetricsService } from './observability/metrics.service.js';

const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9100);
const METRICS_HOST = process.env.METRICS_HOST ?? '127.0.0.1';

async function closeMetricsServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  let metricsServer: Server | undefined;

  registerCorrelationHook(app);

  // ADR-007 (revisado): /metrics numa porta dedicada isolada, não na porta
  // pública do tráfego real — mesma postura dos workers, corrigindo a
  // exposição achada em review.
  const metrics = app.get(MetricsService);
  try {
    metricsServer = await startMetricsServer({
      registry: metrics.registry,
      port: METRICS_PORT,
      host: METRICS_HOST,
      isHealthy: () => true,
    });

    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    await closeMetricsServer(metricsServer);
    await app.close();
    throw error;
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logEvent({ event: 'api_shutting_down' });
    await app.close();
    await closeMetricsServer(metricsServer);
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap().catch((error: unknown) => {
  logEvent({ event: 'api_startup_failed', error });
  process.exit(1);
});
