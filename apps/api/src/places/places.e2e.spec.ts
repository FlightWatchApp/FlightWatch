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

/** SPEC-029 — catálogo de lugares na API, Postgres real. */
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

function http() {
  return request(app.getHttpServer());
}

async function verifiedUser(): Promise<{ token: string; channelId: string }> {
  const registered = await http()
    .post('/v1/auth/register')
    .send({
      email: `${randomUUID()}@example.com`,
      password: 'a-very-long-password-123',
      timezone: 'America/Campo_Grande',
    });
  await prisma.notificationChannel.update({
    where: { id: registered.body.user.notificationChannelId },
    data: { verifiedAt: new Date() },
  });
  return { token: registered.body.token, channelId: registered.body.user.notificationChannelId };
}

function watchBody(origin: string, destination: string, channelId: string) {
  return {
    origin,
    destination,
    tripType: 'ONE_WAY',
    departureDate: '2027-03-01',
    returnDate: null,
    cabin: 'ECONOMY',
    adults: 1,
    currency: 'BRL',
    market: 'BR',
    alertRules: [{ type: 'TARGET_PRICE', amountMinor: 80000, cooldownSeconds: 43200 }],
    notificationChannelId: channelId,
  };
}

function searchBody(origin: string, destination: string) {
  return {
    origin,
    destination,
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
  };
}

describe('GET /v1/places (SPEC-029 AC-5)', () => {
  it('acha São Paulo sem acento, com os aeroportos dela, sem sessão', async () => {
    const response = await http().get('/v1/places').query({ q: 'sao paulo' });
    expect(response.status).toBe(200);
    expect(response.body.places[0]).toEqual({
      code: 'SAO',
      name: 'São Paulo',
      countryCode: 'BR',
      countryName: 'Brasil',
      airports: [
        { code: 'CGH', name: 'Congonhas' },
        { code: 'GRU', name: 'Guarulhos' },
      ],
    });
  });

  it('código de aeroporto e nome alternativo levam à cidade', async () => {
    const byAirport = await http().get('/v1/places').query({ q: 'GRU' });
    expect(byAirport.body.places[0].code).toBe('SAO');
    const byNickname = await http().get('/v1/places').query({ q: 'nova york' });
    expect(byNickname.body.places[0].code).toBe('NYC');
  });

  it('texto curto devolve lista vazia; limite e tamanho do texto são validados', async () => {
    expect((await http().get('/v1/places').query({ q: 's' })).body).toEqual({ places: [] });
    expect(
      (await http().get('/v1/places').query({ q: 'brasil', limit: 1 })).body.places,
    ).toHaveLength(1);
    expect((await http().get('/v1/places').query({ limit: 99 })).status).toBe(400);
    expect(
      (
        await http()
          .get('/v1/places')
          .query({ q: 'x'.repeat(65) })
      ).status,
    ).toBe(400);
  });
});

describe('normalização para cidade (SPEC-029 AC-6/AC-7/AC-8)', () => {
  it('monitoramento GRU → JFK é gravado como SAO → NYC, com os nomes', async () => {
    const { token, channelId } = await verifiedUser();

    const created = await http()
      .post('/v1/watches')
      .set('authorization', `Bearer ${token}`)
      .send(watchBody('GRU', 'JFK', channelId));

    expect(created.status).toBe(201);
    // SPEC-001: a criação devolve a rota dentro de `search`.
    expect(created.body.search).toMatchObject({
      origin: 'SAO',
      destination: 'NYC',
      originName: 'São Paulo',
      destinationName: 'Nova Iorque',
    });

    const list = await http().get('/v1/watches').set('authorization', `Bearer ${token}`);
    expect(list.body.watches[0]).toMatchObject({
      originName: 'São Paulo',
      destinationName: 'Nova Iorque',
    });
  });

  it('busca também normaliza e traz os nomes', async () => {
    const response = await http().post('/v1/searches/flights').send(searchBody('CGH', 'LIS'));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      origin: 'SAO',
      destination: 'LIS',
      originName: 'São Paulo',
      destinationName: 'Lisboa',
    });
  });

  it('código inexistente ou cidade sem voo comercial → 422 UNSUPPORTED_SEARCH', async () => {
    const { token, channelId } = await verifiedUser();
    for (const [origin, destination] of [
      ['ZZZ', 'SAO'],
      ['SAO', 'VSV'],
    ]) {
      const watch = await http()
        .post('/v1/watches')
        .set('authorization', `Bearer ${token}`)
        .send(watchBody(origin as string, destination as string, channelId));
      expect(watch.status).toBe(422);
      expect(watch.body.code).toBe('UNSUPPORTED_SEARCH');

      const search = await http()
        .post('/v1/searches/flights')
        .send(searchBody(origin as string, destination as string));
      expect(search.status).toBe(422);
      expect(search.body.code).toBe('UNSUPPORTED_SEARCH');
    }
  });

  // Caso não previsto na spec: aeroportos diferentes, mesma cidade.
  it('GRU → CGH vira a mesma cidade e é recusado', async () => {
    const { token, channelId } = await verifiedUser();
    const watch = await http()
      .post('/v1/watches')
      .set('authorization', `Bearer ${token}`)
      .send(watchBody('GRU', 'CGH', channelId));
    expect(watch.status).toBe(422);
    expect(watch.body.code).toBe('UNSUPPORTED_SEARCH');
  });
});
