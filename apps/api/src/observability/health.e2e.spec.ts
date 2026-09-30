import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from './correlation.js';
import { MetricsService } from './metrics.service.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let metrics: MetricsService;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  const databasePackageDir = path.resolve(process.cwd(), '../../packages/database');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: databasePackageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();
  metrics = app.get(MetricsService);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

describe('GET /health (e2e, Postgres real via Testcontainers)', () => {
  it('returns 200 ok when Postgres is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

// SPEC-013: correlação ponta a ponta.
describe('x-correlation-id (e2e, Postgres real via Testcontainers)', () => {
  // AC-001: toda resposta inclui o header, mesmo uma rota simples sem guard.
  it('includes x-correlation-id on a successful response', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.headers['x-correlation-id']).toBeTruthy();
  });

  // AC-001: também numa resposta rejeitada por guard (401) — prova que o hook
  // roda antes de qualquer guard, não como interceptor (que seria pulado).
  it('includes x-correlation-id even on a 401 rejected by SessionAuthGuard', async () => {
    const response = await request(app.getHttpServer()).get('/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.headers['x-correlation-id']).toBeTruthy();
  });

  // AC-002
  it('echoes back a valid client-supplied x-correlation-id unchanged', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', 'client-supplied-id-123');
    expect(response.headers['x-correlation-id']).toBe('client-supplied-id-123');
  });

  // AC-003. O caso de caractere de controle (CR/LF) não é testável via HTTP
  // real aqui: o próprio cliente HTTP (Node) recusa montar um header com
  // esses bytes antes mesmo de enviar a requisição — coberto como teste
  // unitário puro de `resolveCorrelationId` em correlation.test.ts.
  it('replaces an invalid x-correlation-id (too long) with a generated one', async () => {
    const tooLong = 'a'.repeat(200);
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', tooLong);
    expect(response.headers['x-correlation-id']).toBeTruthy();
    expect(response.headers['x-correlation-id']).not.toBe(tooLong);
  });
});

// ADR-007 (revisado): /metrics saiu da porta pública do Fastify — serve numa
// porta dedicada isolada (main.ts). Aqui a prova é direto no Registry que
// alimentaria aquele servidor, sem precisar subir mais um listener HTTP só
// pro teste (o conteúdo é idêntico ao que /metrics serviria).
describe('MetricsService registry (e2e, Postgres real via Testcontainers)', () => {
  it('exposes Prometheus text format with default process metrics', async () => {
    const body = await metrics.registry.metrics();
    expect(body).toContain('flight_watch_process_cpu_user_seconds_total');
  });

  // ADR-007 / SPEC-007 §13: prova que a métrica reage a uso real da API, não
  // só que o contador existe.
  it('increments auth_register_total{result="success"} after a real registration', async () => {
    const before = extractCounterValue(
      await metrics.registry.metrics(),
      'auth_register_total',
      'success',
    );

    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: `${randomUUID()}@example.com`,
        password: 'metrics-test-password-1',
        timezone: 'America/Campo_Grande',
      });

    const after = extractCounterValue(
      await metrics.registry.metrics(),
      'auth_register_total',
      'success',
    );
    expect(after).toBe(before + 1);
  });

  it('increments auth_login_total{result="invalid_credentials"} after a failed login', async () => {
    const before = extractCounterValue(
      await metrics.registry.metrics(),
      'auth_login_total',
      'invalid_credentials',
    );

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: `${randomUUID()}@example.com`, password: 'whatever-password-123' });

    const after = extractCounterValue(
      await metrics.registry.metrics(),
      'auth_login_total',
      'invalid_credentials',
    );
    expect(after).toBe(before + 1);
  });
});

function extractCounterValue(metricsText: string, name: string, result: string): number {
  const pattern = new RegExp(`^${name}\\{result="${result}"\\} (\\d+(?:\\.\\d+)?)$`, 'm');
  const match = pattern.exec(metricsText);
  return match?.[1] ? Number(match[1]) : 0;
}
