import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listOpportunitiesResponseSchema } from '@flight-watch/contracts';
import { type PrismaClient, TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import { AppModule } from '../app.module.js';
import { resetAffiliateConfigCache } from '../affiliate/affiliate-links.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

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
  // SPEC-029: rotas são validadas no catálogo de lugares.
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

async function createSearchTarget(overrides: Record<string, unknown> = {}) {
  return prisma.searchTarget.create({
    data: {
      fingerprint: `fp-${randomUUID()}`,
      canonicalKey: `canonical-${randomUUID()}`,
      originIata: 'DOU',
      destinationIata: 'GRU',
      departureDate: new Date('2027-05-01'),
      tripType: 'ONE_WAY',
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      checkIntervalSeconds: 14_400,
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

async function seedObservation(
  searchTargetId: string,
  totalAmountMinor: number,
  observedAt: Date,
  overrides: Record<string, unknown> = {},
) {
  const execution = await prisma.searchExecution.create({
    data: {
      searchTargetId,
      providerStrategy: 'SIMULATED',
      status: 'SUCCEEDED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      completedAt: observedAt,
    },
  });
  return prisma.priceObservation.create({
    data: {
      searchTargetId,
      searchExecutionId: execution.id,
      providerStrategy: 'SIMULATED',
      observedAt,
      totalAmountMinor,
      currency: 'BRL',
      itinerary: [
        {
          originIata: 'DOU',
          destinationIata: 'GRU',
          departureAt: '2027-05-01T08:00:00Z',
          arrivalAt: '2027-05-01T10:30:00Z',
          carrier: 'SIM',
        },
      ],
      offerSignature: randomUUID(),
      qualityFlags: [],
      observationKey: randomUUID(),
      selectionPolicyVersion: 1,
      normalizerVersion: 1,
      deeplink: 'https://booking.simulated-provider.flightwatch.dev/checkout/x',
      expiresAt: new Date(observedAt.getTime() + 3_600_000),
      ...overrides,
    },
  });
}

describe('GET /v1/opportunities (e2e, Postgres real via Testcontainers)', () => {
  it('classifies HISTORICAL_LOW when the latest price is the lowest ever seen', async () => {
    const target = await createSearchTarget({ departureDate: new Date('2027-06-01') });
    await seedObservation(target.id, 100_000, new Date('2027-01-01'));
    await seedObservation(target.id, 90_000, new Date('2027-01-02'));
    await seedObservation(target.id, 60_000, new Date('2027-01-03'));

    const response = await request(app.getHttpServer())
      .get('/v1/opportunities')
      .query({ origin: 'DOU', destination: 'GRU' });

    expect(response.status).toBe(200);
    listOpportunitiesResponseSchema.parse(response.body);
    const item = response.body.opportunities.find(
      (o: { searchTargetId: string }) => o.searchTargetId === target.id,
    );
    expect(item).toBeDefined();
    expect(item.deal.dealType).toBe('HISTORICAL_LOW');
    expect(item.deal.currentAmountMinor).toBe(60_000);
    expect(item.offer.purchaseUrl).toMatch(/^https:\/\/booking\.simulated-provider/);
  });

  it('classifies PERCENTAGE_BELOW_REFERENCE when far below average but not the lowest ever', async () => {
    const target = await createSearchTarget({ departureDate: new Date('2027-06-02') });
    await seedObservation(target.id, 50_000, new Date('2027-01-01'));
    await seedObservation(target.id, 100_000, new Date('2027-01-02'));
    await seedObservation(target.id, 100_000, new Date('2027-01-03'));
    await seedObservation(target.id, 60_000, new Date('2027-01-04'));

    const response = await request(app.getHttpServer())
      .get('/v1/opportunities')
      .query({ dealType: 'PERCENTAGE_BELOW_REFERENCE' });

    expect(response.status).toBe(200);
    const item = response.body.opportunities.find(
      (o: { searchTargetId: string }) => o.searchTargetId === target.id,
    );
    expect(item).toBeDefined();
    expect(item.deal.dealType).toBe('PERCENTAGE_BELOW_REFERENCE');
    expect(item.deal.dropPercent).toBeGreaterThan(10);
  });

  it('returns purchaseUrl: null when the deeplink host is not allowlisted', async () => {
    const target = await createSearchTarget({ departureDate: new Date('2027-06-03') });
    await seedObservation(target.id, 100_000, new Date('2027-01-01'));
    await seedObservation(target.id, 60_000, new Date('2027-01-02'), {
      deeplink: 'https://evil.example.com/checkout',
    });

    const response = await request(app.getHttpServer()).get('/v1/opportunities');

    const item = response.body.opportunities.find(
      (o: { searchTargetId: string }) => o.searchTargetId === target.id,
    );
    expect(item?.offer.purchaseUrl).toBeNull();
  });

  // SPEC-020: parâmetros de afiliado entram só depois da allowlist de SPEC-018.
  it('adds affiliate params and utm_campaign=opportunity when AFFILIATE_TRACKING_PARAMS is set', async () => {
    const previous = process.env.AFFILIATE_TRACKING_PARAMS;
    process.env.AFFILIATE_TRACKING_PARAMS = '{"SIMULATED":{"marker":"fw-e2e"}}';
    resetAffiliateConfigCache();
    try {
      const allowed = await createSearchTarget({ departureDate: new Date('2027-06-05') });
      await seedObservation(allowed.id, 100_000, new Date('2027-01-01'));
      await seedObservation(allowed.id, 60_000, new Date('2027-01-02'));
      const blocked = await createSearchTarget({ departureDate: new Date('2027-06-06') });
      await seedObservation(blocked.id, 100_000, new Date('2027-01-01'));
      await seedObservation(blocked.id, 60_000, new Date('2027-01-02'), {
        deeplink: 'https://evil.example.com/checkout',
      });

      const response = await request(app.getHttpServer()).get('/v1/opportunities');

      const item = response.body.opportunities.find(
        (o: { searchTargetId: string }) => o.searchTargetId === allowed.id,
      );
      const url = new URL(item.offer.purchaseUrl);
      expect(url.hostname).toBe('booking.simulated-provider.flightwatch.dev');
      expect(url.searchParams.get('marker')).toBe('fw-e2e');
      expect(url.searchParams.get('utm_source')).toBe('flightwatch');
      expect(url.searchParams.get('utm_campaign')).toBe('opportunity');

      const blockedItem = response.body.opportunities.find(
        (o: { searchTargetId: string }) => o.searchTargetId === blocked.id,
      );
      expect(blockedItem?.offer.purchaseUrl).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.AFFILIATE_TRACKING_PARAMS;
      } else {
        process.env.AFFILIATE_TRACKING_PARAMS = previous;
      }
      resetAffiliateConfigCache();
    }
  });

  it('keeps purchaseUrl identical to SPEC-018 when AFFILIATE_TRACKING_PARAMS is unset', async () => {
    const previous = process.env.AFFILIATE_TRACKING_PARAMS;
    delete process.env.AFFILIATE_TRACKING_PARAMS;
    resetAffiliateConfigCache();
    try {
      const target = await createSearchTarget({ departureDate: new Date('2027-06-07') });
      await seedObservation(target.id, 100_000, new Date('2027-01-01'));
      await seedObservation(target.id, 60_000, new Date('2027-01-02'));

      const response = await request(app.getHttpServer()).get('/v1/opportunities');

      const item = response.body.opportunities.find(
        (o: { searchTargetId: string }) => o.searchTargetId === target.id,
      );
      expect(item.offer.purchaseUrl).toBe(
        'https://booking.simulated-provider.flightwatch.dev/checkout/x',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.AFFILIATE_TRACKING_PARAMS;
      } else {
        process.env.AFFILIATE_TRACKING_PARAMS = previous;
      }
      resetAffiliateConfigCache();
    }
  });

  it('excludes a target with only one observation from the feed', async () => {
    const target = await createSearchTarget({ departureDate: new Date('2027-06-04') });
    await seedObservation(target.id, 50_000, new Date('2027-01-01'));

    const response = await request(app.getHttpServer()).get('/v1/opportunities');

    const item = response.body.opportunities.find(
      (o: { searchTargetId: string }) => o.searchTargetId === target.id,
    );
    expect(item).toBeUndefined();
  });

  it('excludes an INACTIVE target and a target with a past departureDate', async () => {
    const inactive = await createSearchTarget({
      departureDate: new Date('2027-06-05'),
      status: 'INACTIVE',
    });
    const past = await createSearchTarget({ departureDate: new Date('2020-01-01') });
    for (const target of [inactive, past]) {
      await seedObservation(target.id, 100_000, new Date('2027-01-01'));
      await seedObservation(target.id, 60_000, new Date('2027-01-02'));
    }

    const response = await request(app.getHttpServer()).get('/v1/opportunities');

    const ids = response.body.opportunities.map(
      (o: { searchTargetId: string }) => o.searchTargetId,
    );
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(past.id);
  });

  it('filters by maxPriceMinor', async () => {
    const target = await createSearchTarget({ departureDate: new Date('2027-06-06') });
    await seedObservation(target.id, 100_000, new Date('2027-01-01'));
    await seedObservation(target.id, 90_000, new Date('2027-01-02'));
    await seedObservation(target.id, 85_000, new Date('2027-01-03'));

    const excluded = await request(app.getHttpServer())
      .get('/v1/opportunities')
      .query({ maxPriceMinor: 80_000 });
    const included = await request(app.getHttpServer())
      .get('/v1/opportunities')
      .query({ maxPriceMinor: 90_000 });

    const excludedIds = excluded.body.opportunities.map(
      (o: { searchTargetId: string }) => o.searchTargetId,
    );
    const includedIds = included.body.opportunities.map(
      (o: { searchTargetId: string }) => o.searchTargetId,
    );
    expect(excludedIds).not.toContain(target.id);
    expect(includedIds).toContain(target.id);
  });

  it('returns 400 INVALID_OPPORTUNITIES_QUERY for a malformed filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/opportunities')
      .query({ origin: 'DOUR' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_OPPORTUNITIES_QUERY');
  });

  it('works without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/v1/opportunities');
    expect(response.status).toBe(200);
  });
});
