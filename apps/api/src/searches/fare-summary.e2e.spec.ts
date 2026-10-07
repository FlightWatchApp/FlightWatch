import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import type { FlightOffer } from '@flight-watch/domain';
import type { FlightProvider, FlightSearchQuery } from '@flight-watch/providers';
import { resetAffiliateConfigCache } from '../affiliate/affiliate-links.js';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FLIGHT_PROVIDER } from './flight-provider.token.js';

/**
 * SPEC-030 — oferta-resumo (cache de preços) de ponta a ponta na API, com
 * Postgres real. O provedor é um stub com a mesma saída do adaptador
 * Travelpayouts; o adaptador em si tem testes próprios em packages/providers.
 */
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

function summaryOfferFor(query: FlightSearchQuery): FlightOffer {
  const observedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return {
    providerOfferId: `tp|${query.originIata}|${query.destinationIata}|${query.departureDate}`,
    totalAmountMinor: 256_800,
    currency: query.currency,
    passengerCount: query.adults,
    segments: [],
    fareSummary: {
      originCode: query.originIata,
      destinationCode: query.destinationIata,
      departureDate: query.departureDate,
      returnDate: query.returnDate,
      stops: 1,
      durationMinutes: 785,
    },
    observedAt: observedAt.toISOString(),
    expiresAt: new Date(observedAt.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    deeplink: `https://www.aviasales.com/search/${query.originIata}1711${query.destinationIata}1`,
    qualityFlags: ['CACHED_PRICE'],
  };
}

const travelpayoutsStub: FlightProvider = {
  strategy: 'TRAVELPAYOUTS',
  async search(query) {
    return { kind: 'offers', offers: [summaryOfferFor(query)] };
  },
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
  process.env.AFFILIATE_TRACKING_PARAMS = '{"TRAVELPAYOUTS":{"marker":"fw-teste"}}';
  resetAffiliateConfigCache();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FLIGHT_PROVIDER)
    .useValue(travelpayoutsStub)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService).client;
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  delete process.env.AFFILIATE_TRACKING_PARAMS;
  resetAffiliateConfigCache();
  await app?.close();
  await container?.stop();
});

describe('busca com oferta-resumo (SPEC-030)', () => {
  it('devolve o resumo, sem trechos, com link da Aviasales e marker de afiliado', async () => {
    const response = await request(app.getHttpServer()).post('/v1/searches/flights').send({
      origin: 'GRU',
      destination: 'JFK',
      tripType: 'ONE_WAY',
      departureDate: '2027-03-17',
      returnDate: null,
      dateFlexibilityDays: 0,
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      maxStops: null,
      maxPriceMinor: null,
    });

    expect(response.status).toBe(201);
    const [offer] = response.body.offers;
    expect(offer).toMatchObject({
      provider: 'TRAVELPAYOUTS',
      segments: [],
      fareSummary: {
        departureDate: '2027-03-17',
        returnDate: null,
        stops: 1,
        durationMinutes: 785,
      },
      totalAmountMinor: 256_800,
      durationMinutes: 785,
      connectionsCount: 1,
      availabilityStatus: 'CURRENT',
      qualityFlags: ['CACHED_PRICE'],
    });
    // AC-9: host na allowlist e marker do AFFILIATE_TRACKING_PARAMS.
    const purchaseUrl = new URL(offer.purchaseUrl);
    expect(purchaseUrl.hostname).toBe('www.aviasales.com');
    expect(purchaseUrl.searchParams.get('marker')).toBe('fw-teste');

    // Leitura posterior (GET) lê o itinerário gravado no mesmo formato.
    const fetched = await request(app.getHttpServer()).get(
      `/v1/searches/flights/${response.body.id}`,
    );
    expect(fetched.body.offers[0].fareSummary).toEqual(offer.fareSummary);
  });

  it('maxStops filtra pelas escalas do resumo', async () => {
    const response = await request(app.getHttpServer()).post('/v1/searches/flights').send({
      origin: 'SAO',
      destination: 'LIS',
      tripType: 'ONE_WAY',
      departureDate: '2027-03-18',
      returnDate: null,
      dateFlexibilityDays: 0,
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      maxStops: 0,
      maxPriceMinor: null,
    });
    expect(response.status).toBe(201);
    expect(response.body.offers).toEqual([]);
  });
});

describe('promoção com itinerário-resumo gravado (SPEC-030)', () => {
  it('lê o resumo gravado e devolve fareSummary na oferta', async () => {
    const target = await prisma.searchTarget.create({
      data: {
        fingerprint: `fp-${randomUUID()}`,
        canonicalKey: `canonical-${randomUUID()}`,
        originIata: 'SAO',
        destinationIata: 'NYC',
        departureDate: new Date('2027-05-01'),
        tripType: 'ONE_WAY',
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        checkIntervalSeconds: 14_400,
        status: 'ACTIVE',
        providerStrategy: 'TRAVELPAYOUTS',
      },
    });
    const now = Date.now();
    for (const [index, amount] of [300_000, 290_000, 200_000].entries()) {
      const observedAt = new Date(now - (3 - index) * 60 * 60 * 1000);
      const execution = await prisma.searchExecution.create({
        data: {
          searchTargetId: target.id,
          providerStrategy: 'TRAVELPAYOUTS',
          status: 'SUCCEEDED',
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
          completedAt: observedAt,
        },
      });
      await prisma.priceObservation.create({
        data: {
          searchTargetId: target.id,
          searchExecutionId: execution.id,
          providerStrategy: 'TRAVELPAYOUTS',
          observedAt,
          totalAmountMinor: amount,
          currency: 'BRL',
          itinerary: {
            kind: 'FARE_SUMMARY',
            originCode: 'SAO',
            destinationCode: 'NYC',
            departureDate: '2027-05-01',
            returnDate: null,
            stops: 0,
            durationMinutes: null,
          },
          offerSignature: `FARE|SAO|NYC|2027-05-01|-|0|-|${index}`,
          qualityFlags: ['CACHED_PRICE'],
          observationKey: randomUUID(),
          selectionPolicyVersion: 1,
          normalizerVersion: 1,
          deeplink: 'https://www.aviasales.com/search/SAO0105NYC1',
          expiresAt: new Date(observedAt.getTime() + 72 * 60 * 60 * 1000),
        },
      });
    }

    const response = await request(app.getHttpServer())
      .get('/v1/opportunities')
      .query({ origin: 'SAO', destination: 'NYC' });

    expect(response.status).toBe(200);
    const item = response.body.opportunities.find(
      (opportunity: { searchTargetId: string }) => opportunity.searchTargetId === target.id,
    );
    expect(item.offer).toMatchObject({
      segments: [],
      fareSummary: {
        departureDate: '2027-05-01',
        returnDate: null,
        stops: 0,
        durationMinutes: null,
      },
      durationMinutes: null,
      connectionsCount: 0,
      amountMinor: 200_000,
    });
    expect(new URL(item.offer.purchaseUrl).hostname).toBe('www.aviasales.com');
  });
});
