import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PASSWORD = 'a-very-long-password-123';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService).client;
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

async function verifiedUser(): Promise<{ userId: string; channelId: string; token: string }> {
  const response = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({
      email: `${randomUUID()}@example.com`,
      password: PASSWORD,
      timezone: 'America/Sao_Paulo',
    });
  const channel = await prisma.notificationChannel.update({
    where: { id: response.body.user.notificationChannelId },
    data: { verifiedAt: new Date() },
  });
  return { userId: response.body.user.id, channelId: channel.id, token: response.body.token };
}

const auth = (token: string) => ['authorization', `Bearer ${token}`] as const;

describe('GET /v1/me/overview (SPEC-040)', () => {
  it('pessoa nova: nada para mostrar além da busca', async () => {
    const { token } = await verifiedUser();
    const response = await request(app.getHttpServer())
      .get('/v1/me/overview')
      .set(...auth(token));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      watchQuota: { used: 0, limit: 5, resetsAt: expect.any(String) },
      homeCity: null,
      activeCount: 0,
      alertsSent: 0,
      belowTypicalNow: 0,
      biggestDrop: null,
      activeWatches: [],
      watchCount: 0,
      destinationPromotions: [],
    });
  });

  it('com monitoramento: aparece nos ativos, com o resumo do preço baixo', async () => {
    const { token, channelId } = await verifiedUser();
    const created = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...auth(token))
      .send({
        origin: 'DOU',
        destination: 'GRU',
        tripType: 'ONE_WAY',
        departureDate: '2026-12-20',
        returnDate: null,
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        notificationChannelId: channelId,
      });
    expect(created.status).toBe(201);

    const response = await request(app.getHttpServer())
      .get('/v1/me/overview')
      .set(...auth(token));
    expect(response.body).toMatchObject({ activeCount: 1, watchCount: 1, alertsSent: 0 });
    expect(response.body.activeWatches).toHaveLength(1);
    expect(response.body.activeWatches[0]).toMatchObject({
      id: created.body.id,
      lowPrice: { dropPercent: 15 },
    });
  });

  it('pede login', async () => {
    const response = await request(app.getHttpServer()).get('/v1/me/overview');
    expect(response.status).toBe(401);
  });
});

describe('PATCH /v1/me — cidade de partida (SPEC-040)', () => {
  it('aeroporto vira a cidade, vale no overview, recusa cidade fora do catálogo e apaga com null', async () => {
    const { token } = await verifiedUser();
    const saved = await request(app.getHttpServer())
      .patch('/v1/me')
      .set(...auth(token))
      .send({ homeCityCode: 'gru' });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ homeCity: { code: 'SAO', name: 'São Paulo' } });

    const overview = await request(app.getHttpServer())
      .get('/v1/me/overview')
      .set(...auth(token));
    expect(overview.body.homeCity).toEqual({ code: 'SAO', name: 'São Paulo' });

    const unknown = await request(app.getHttpServer())
      .patch('/v1/me')
      .set(...auth(token))
      .send({ homeCityCode: 'ZZZ' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('UNSUPPORTED_CITY');

    const cleared = await request(app.getHttpServer())
      .patch('/v1/me')
      .set(...auth(token))
      .send({ homeCityCode: null });
    expect(cleared.body).toEqual({ homeCity: null });
  });

  it('exclusão da conta apaga a cidade (AC-6)', async () => {
    const { token, userId } = await verifiedUser();
    await request(app.getHttpServer())
      .patch('/v1/me')
      .set(...auth(token))
      .send({ homeCityCode: 'SAO' });
    const deleted = await request(app.getHttpServer())
      .post('/v1/auth/delete-account')
      .set(...auth(token))
      .send({ password: PASSWORD });
    expect(deleted.status).toBe(204);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.homeCityCode).toBeNull();
  });
});
