import { execSync } from 'node:child_process';
import path from 'node:path';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_INTERNAL_API_SECRET } from '@flight-watch/config';
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@flight-watch/contracts';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';

/**
 * SPEC-025 — app próprio com limites baixos. A configuração é lida quando o
 * módulo é compilado (SPEC-024), então basta ajustar process.env antes.
 */
const AUTH_LIMIT = 3;
const SEARCH_LIMIT = 2;

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
const previousEnv = {
  AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
};

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  process.env.AUTH_RATE_LIMIT_MAX = String(AUTH_LIMIT);
  process.env.RATE_LIMIT_MAX = String(SEARCH_LIMIT);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();
}, 120_000);

afterAll(async () => {
  process.env.AUTH_RATE_LIMIT_MAX = previousEnv.AUTH_RATE_LIMIT_MAX;
  process.env.RATE_LIMIT_MAX = previousEnv.RATE_LIMIT_MAX;
  await app?.close();
  await container?.stop();
});

/** Requisição como o web faria: IP do cliente autenticado pelo segredo interno. */
function fromClient(clientIp: string): Record<string, string> {
  return { [CLIENT_IP_HEADER]: clientIp, [INTERNAL_SECRET_HEADER]: LOCAL_INTERNAL_API_SECRET };
}

async function login(headers: Record<string, string>): Promise<request.Response> {
  return request(app.getHttpServer())
    .post('/v1/auth/login')
    .set(headers)
    .send({ email: 'nobody@example.com', password: 'a-very-long-password-123' });
}

async function loginStatuses(headers: Record<string, string>, times: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    statuses.push((await login(headers)).status);
  }
  return statuses;
}

describe('rate limit das rotas de auth (SPEC-025, e2e)', () => {
  // AC-4
  it('responde 429 RATE_LIMITED depois de AUTH_RATE_LIMIT_MAX tentativas de login', async () => {
    const statuses = await loginStatuses(fromClient('177.0.0.1'), AUTH_LIMIT);
    expect(statuses).toEqual([401, 401, 401]);

    const blocked = await login(fromClient('177.0.0.1'));
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });

  // AC-1
  it('IPs de cliente diferentes têm orçamentos independentes', async () => {
    await loginStatuses(fromClient('177.0.0.2'), AUTH_LIMIT + 1);
    expect((await login(fromClient('177.0.0.3'))).status).toBe(401);
  });

  // AC-2 (ponta a ponta): sem o segredo, variar o header não escapa do limite.
  it('ignora x-fw-client-ip forjado sem o segredo interno', async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= AUTH_LIMIT; i += 1) {
      statuses.push((await login({ [CLIENT_IP_HEADER]: `200.0.0.${i}` })).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  // AC-5
  it('auth e busca não consomem o orçamento uma da outra', async () => {
    const client = fromClient('177.0.0.4');
    await loginStatuses(client, AUTH_LIMIT + 1);

    const search = await request(app.getHttpServer())
      .post('/v1/searches/flights')
      .set(client)
      .send({
        origin: 'DOU',
        destination: 'GRU',
        tripType: 'ONE_WAY',
        departureDate: '2027-03-01',
        returnDate: null,
        dateFlexibilityDays: 0,
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        maxStops: 1,
        maxPriceMinor: null,
      });
    expect(search.status).toBe(201);
  });
});
