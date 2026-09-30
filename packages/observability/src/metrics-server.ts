import { type Server, createServer } from 'node:http';
import type { Registry } from '@prometheus-io/client';

export interface MetricsServerOptions {
  registry: Registry;
  port: number;
  /** 0.0.0.0 somente quando o scraper estiver numa rede interna confiável. */
  host?: string;
  /** Falha (503) quando retorna `false` — ex.: conexão com Postgres/Redis perdida. */
  isHealthy?: () => boolean;
}

/**
 * ADR-007: workers/scheduler não têm servidor HTTP hoje — um `node:http` puro
 * é suficiente só pra `/metrics` e `/health`, não justifica trazer Fastify
 * pra um processo que só consome fila.
 */
export async function startMetricsServer(options: MetricsServerOptions): Promise<Server> {
  const { registry, port, host = '127.0.0.1', isHealthy } = options;

  const server = createServer((req, res) => {
    if (req.url === '/metrics') {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { 'content-type': registry.contentType });
          res.end(body);
        })
        .catch(() => {
          res.writeHead(500, { 'content-type': 'text/plain' });
          // Não devolver mensagem de erro interna no endpoint de métricas.
          res.end('metrics unavailable');
        });
      return;
    }

    if (req.url === '/health') {
      try {
        const healthy = isHealthy ? isHealthy() : true;
        res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: healthy ? 'ok' : 'unhealthy' }));
      } catch {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'unhealthy' }));
      }
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  return server;
}
