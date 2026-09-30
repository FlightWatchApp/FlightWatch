import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@flight-watch/database';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
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

  prisma = app.get(PrismaService).client;
  metrics = app.get(MetricsService);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

/** Mesmo padrão de apps/api/src/watches/watches.e2e.spec.ts. */
async function createVerifiedUserWithChannel(): Promise<{
  userId: string;
  channelId: string;
  token: string;
}> {
  const registerResponse = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({
      email: `${randomUUID()}@example.com`,
      password: 'a-very-long-password-123',
      timezone: 'America/Sao_Paulo',
    });
  const channel = await prisma.notificationChannel.update({
    where: { id: registerResponse.body.user.notificationChannelId },
    data: { verifiedAt: new Date() },
  });
  return {
    userId: registerResponse.body.user.id,
    channelId: channel.id,
    token: registerResponse.body.token as string,
  };
}

function authHeader(token: string): [string, string] {
  return ['authorization', `Bearer ${token}`];
}

function validSearchBody(overrides: Record<string, unknown> = {}) {
  return {
    origin: 'DOU',
    destination: 'GRU',
    tripType: 'ONE_WAY',
    departureDate: '2026-12-20',
    returnDate: null,
    dateFlexibilityDays: 0,
    cabin: 'ECONOMY',
    adults: 1,
    currency: 'BRL',
    market: 'BR',
    maxStops: 1,
    maxPriceMinor: null,
    ...overrides,
  };
}

async function createSearch(overrides: Record<string, unknown> = {}) {
  const response = await request(app.getHttpServer())
    .post('/v1/searches/flights')
    .send(validSearchBody(overrides));
  return response;
}

describe('POST /v1/searches/flights (e2e, Postgres real via Testcontainers)', () => {
  // AC-001
  it('creates a SUCCEEDED search with an eligible offer, without authentication', async () => {
    const response = await createSearch({ departureDate: '2026-12-21' });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('SUCCEEDED');
    expect(response.body.errorCode).toBeNull();
    expect(response.body.offers).toHaveLength(1);

    const offer = response.body.offers[0];
    expect(Number.isInteger(offer.totalAmountMinor)).toBe(true);
    expect(offer.currency).toBe('BRL');
    expect(offer.provider).toBe('SIMULATED');
    expect(offer.availabilityStatus).toBe('CURRENT');
    expect(offer.purchaseUrl).toMatch(
      /^https:\/\/booking\.simulated-provider\.flightwatch\.dev\/checkout\//,
    );
    expect(offer.segments[0].originIata).toBe('DOU');

    const stored = await prisma.flightSearchOffer.count({
      where: { flightSearchId: response.body.id },
    });
    expect(stored).toBe(1);
  });

  // AC-005: dado do provider não vaza como "nenhuma passagem existe" — aqui,
  // um filtro de preço legítimo (maxPriceMinor) também não deve ser
  // confundido com falha; é SUCCEEDED com offers vazio.
  it('returns SUCCEEDED with an empty offers array when maxPriceMinor filters out everything', async () => {
    const response = await createSearch({ departureDate: '2026-12-22', maxPriceMinor: 1 });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('SUCCEEDED');
    expect(response.body.offers).toEqual([]);
  });

  it('returns 400 INVALID_SEARCH_INPUT for origin equal to destination', async () => {
    const response = await createSearch({ departureDate: '2026-12-23', destination: 'DOU' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_SEARCH_INPUT');
  });

  it('returns 422 UNSUPPORTED_SEARCH for a currency outside the placeholder catalog', async () => {
    const response = await createSearch({ departureDate: '2026-12-24', currency: 'EUR' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('UNSUPPORTED_SEARCH');
  });
});

describe('GET /v1/searches/flights/:id (e2e, Postgres real via Testcontainers)', () => {
  it('returns the persisted search with its offers', async () => {
    const created = await createSearch({ departureDate: '2026-12-25' });

    const response = await request(app.getHttpServer()).get(
      `/v1/searches/flights/${created.body.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
  });

  it('returns 404 FLIGHT_SEARCH_NOT_FOUND for a nonexistent id', async () => {
    const response = await request(app.getHttpServer()).get(`/v1/searches/flights/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('FLIGHT_SEARCH_NOT_FOUND');
  });

  it('returns 400 INVALID_SEARCH_ID for a malformed id', async () => {
    const response = await request(app.getHttpServer()).get('/v1/searches/flights/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_SEARCH_ID');
  });
});

describe('POST /v1/offers/:id/watch (e2e, Postgres real via Testcontainers)', () => {
  function deriveWatchBody(channelId: string, overrides: Record<string, unknown> = {}) {
    return {
      alertRules: [{ type: 'TARGET_PRICE', amountMinor: 80_000, cooldownSeconds: 43_200 }],
      notificationChannelId: channelId,
      ...overrides,
    };
  }

  // AC principal desta rota: o Watch derivado já expõe currentOffer, sem
  // esperar o próximo tick do scheduler — a razão de existir de
  // seedInitialObservation.
  it('creates a Watch from a search offer, with currentOffer already populated', async () => {
    const search = await createSearch({ departureDate: '2027-01-05' });
    const offer = search.body.offers[0];
    const { channelId, token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post(`/v1/offers/${offer.id}/watch`)
      .set(...authHeader(token))
      .send(deriveWatchBody(channelId));

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.search.origin).toBe('DOU');

    const list = await request(app.getHttpServer())
      .get('/v1/watches')
      .set(...authHeader(token));
    const watchItem = list.body.watches.find((w: { id: string }) => w.id === response.body.id);
    expect(watchItem.currentOffer).not.toBeNull();
    expect(watchItem.currentOffer.amountMinor).toBe(offer.totalAmountMinor);
    expect(watchItem.currentOffer.purchaseUrl).toBe(offer.purchaseUrl);
    expect(watchItem.currentOffer.status).toBe('CURRENT');
  });

  it('returns 404 OFFER_NOT_FOUND for a nonexistent offer id', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post(`/v1/offers/${randomUUID()}/watch`)
      .set(...authHeader(token))
      .send(deriveWatchBody(channelId));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('OFFER_NOT_FOUND');
  });

  // Seed direto via Prisma: SimulatedFlightProvider sempre gera expiresAt no
  // futuro (TTL de 1h), então não há como uma busca real produzir uma
  // oferta já expirada no momento do teste.
  it('returns 410 OFFER_EXPIRED for an offer whose expiresAt is already in the past', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const flightSearch = await prisma.flightSearch.create({
      data: {
        originIata: 'DOU',
        destinationIata: 'GRU',
        departureDate: new Date('2027-01-06'),
        tripType: 'ONE_WAY',
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        correlationId: randomUUID(),
        status: 'SUCCEEDED',
      },
    });
    const offer = await prisma.flightSearchOffer.create({
      data: {
        flightSearchId: flightSearch.id,
        providerStrategy: 'SIMULATED',
        providerOfferId: 'sim-expired',
        totalAmountMinor: 90_000,
        currency: 'BRL',
        passengerCount: 1,
        itinerary: [
          {
            originIata: 'DOU',
            destinationIata: 'GRU',
            departureAt: '2027-01-06T08:00:00Z',
            arrivalAt: '2027-01-06T10:30:00Z',
            carrier: 'SIM',
          },
        ],
        offerSignature: randomUUID(),
        observedAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 60_000),
        deeplink: 'https://booking.simulated-provider.flightwatch.dev/checkout/expired',
        qualityFlags: [],
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/offers/${offer.id}/watch`)
      .set(...authHeader(token))
      .send(deriveWatchBody(channelId));

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('OFFER_EXPIRED');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/offers/${randomUUID()}/watch`)
      .send(deriveWatchBody(randomUUID()));

    expect(response.status).toBe(401);
  });

  // SPEC-014 §"Idempotência e concorrência": discovery-seed:${watchId} torna
  // seedInitialObservation um no-op seguro num replay — sem isso, repetir a
  // Idempotency-Key duplicaria SearchExecution/PriceObservation.
  it('does not duplicate the seeded SearchExecution/PriceObservation on an Idempotency-Key replay', async () => {
    const search = await createSearch({ departureDate: '2027-01-07' });
    const offer = search.body.offers[0];
    const { channelId, token } = await createVerifiedUserWithChannel();
    const idempotencyKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post(`/v1/offers/${offer.id}/watch`)
      .set(...authHeader(token))
      .set('idempotency-key', idempotencyKey)
      .send(deriveWatchBody(channelId));
    const second = await request(app.getHttpServer())
      .post(`/v1/offers/${offer.id}/watch`)
      .set(...authHeader(token))
      .set('idempotency-key', idempotencyKey)
      .send(deriveWatchBody(channelId));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const executionCount = await prisma.searchExecution.count({
      where: { idempotencyKey: `discovery-seed:${first.body.id}` },
    });
    expect(executionCount).toBe(1);
  });

  it('records flight_offer_watch_derive_total with a success result', async () => {
    const search = await createSearch({ departureDate: '2027-01-08' });
    const offer = search.body.offers[0];
    const { channelId, token } = await createVerifiedUserWithChannel();

    await request(app.getHttpServer())
      .post(`/v1/offers/${offer.id}/watch`)
      .set(...authHeader(token))
      .send(deriveWatchBody(channelId));

    const body = await metrics.registry.metrics();
    expect(body).toContain('flight_offer_watch_derive_total{result="success"}');
  });
});

describe('rate limiting on POST /v1/searches/flights (SPEC-014, isolated app instance)', () => {
  // Instância própria: o throttler guarda estado em memória por processo
  // (ThrottlerStorageService é um provider — cada Test.createTestingModule()
  // novo tem seu próprio, isolado do app compartilhado pelos describes
  // acima). Sem isolar, este teste consumiria o mesmo orçamento que os
  // outros testes desta suíte já usam.
  let isolatedApp: NestFastifyApplication;

  afterAll(async () => {
    await isolatedApp?.close();
  });

  it('returns 429 RATE_LIMITED after exceeding RATE_LIMIT_MAX requests', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    isolatedApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await isolatedApp.init();
    // Achado ao rodar este teste pela primeira vez: sem o hook de
    // correlação, @CurrentCorrelationId() nunca populava correlationId, e
    // toda requisição pré-limite falhava com 500 (correlationId ausente no
    // insert) em vez de 201 — o teste só checava a ÚLTIMA resposta, então
    // "passava" mesmo com as 15 anteriores quebradas por um motivo
    // completamente diferente do que o teste pretende cobrir.
    registerCorrelationHook(isolatedApp);
    await isolatedApp.getHttpAdapter().getInstance().ready();

    // RATE_LIMIT_MAX é 15 nesta suíte (apps/api/vitest.config.ts) — a
    // 16ª requisição precisa estourar o limite.
    const rateLimit = Number(process.env.RATE_LIMIT_MAX ?? 15);
    const responses: request.Response[] = [];
    for (let i = 0; i < rateLimit + 1; i += 1) {
      responses.push(
        await request(isolatedApp.getHttpServer())
          .post('/v1/searches/flights')
          .send(validSearchBody({ departureDate: '2027-02-01' })),
      );
    }

    const withinLimit = responses.slice(0, rateLimit);
    const overLimit = responses[rateLimit];
    expect(withinLimit.every((r) => r.status === 201)).toBe(true);
    expect(overLimit?.status).toBe(429);
    expect(overLimit?.body.code).toBe('RATE_LIMITED');
  });
});
