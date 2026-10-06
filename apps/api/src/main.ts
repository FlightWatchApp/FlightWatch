import 'reflect-metadata';
import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigError, apiConfig, loadConfig } from '@flight-watch/config';
import { logEvent, startMetricsServer } from '@flight-watch/observability';
import { AppModule } from './app.module.js';
import { registerCorrelationHook } from './observability/correlation.js';
import { MetricsService } from './observability/metrics.service.js';

async function closeMetricsServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function bootstrap(): Promise<void> {
  // SPEC-024: valida antes do Nest subir — configuração inválida (ou adapter
  // simulado em produção) impede o startup sem abrir conexão nenhuma.
  const config = loadConfig(apiConfig, process.env);
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
      port: config.METRICS_PORT,
      host: config.METRICS_HOST,
      isHealthy: () => true,
    });

    logEvent({
      event: 'api_starting',
      appEnv: config.APP_ENV,
      port: config.PORT,
      metricsPort: config.METRICS_PORT,
    });
    await app.listen(config.PORT, '0.0.0.0');
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
  logEvent(
    error instanceof ConfigError ? error.toLogEvent() : { event: 'api_startup_failed', error },
  );
  process.exit(1);
});
