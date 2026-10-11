import { execSync } from 'node:child_process';
import path from 'node:path';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_INTERNAL_API_SECRET } from '@flight-watch/config';
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@flight-watch/contracts';
import { TEST_PLACES, createPrismaClient, syncPlacesCatalog } from '@flight-watch/database';
import {
  type CalendarDay,
  type CheapestByDestinationQuery,
  type DestinationFare,
  type FlightProvider,
  type PriceCalendarQuery,
  ProviderError,
  SimulatedFlightProvider,
} from '@flight-watch/providers';
import { resetAffiliateConfigCache } from '../affiliate/affiliate-links.js';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { MetricsService } from '../observability/metrics.service.js';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
  MemoryKeyValueStore,
} from '../pricing-source/key-value-store.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';

/** SPEC-032 — GET /v1/promotions, Postgres real e provedor com chamadas contadas. */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

function daysOfMonth(month: string): string[] {
  const [year, monthIndex] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year ?? 0, monthIndex ?? 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

const DEPARTURE = isoDate(20);

/**
 * Cenário por destino, a partir de qualquer origem:
 * - RIO: R$ 500 contra R$ 1.000 nas outras datas → promoção nacional (50%);
 * - LIS: R$ 1.800 contra R$ 2.000 → 10%, abaixo do limiar internacional;
 * - MIA: R$ 100 contra R$ 1.000 → 90%, suspeito;
 * - NYC: calendário fora do ar → sai desta rodada;
 * - DOU: poucas datas de referência → dados insuficientes;
 * - BSB: preço visto há 80 h → inválido;
 * - ZZZ: fora do catálogo.
 */
const FARES: Record<string, { amountMinor: number; observedAt?: string }> = {
  RIO: { amountMinor: 50_000 },
  LIS: { amountMinor: 180_000 },
  MIA: { amountMinor: 10_000 },
  NYC: { amountMinor: 200_000 },
  DOU: { amountMinor: 60_000 },
  BSB: { amountMinor: 30_000, observedAt: hoursAgo(80) },
  ZZZ: { amountMinor: 1_000 },
};
const REFERENCE: Record<string, number> = {
  RIO: 100_000,
  LIS: 200_000,
  MIA: 100_000,
  DOU: 100_000,
};

class CountingProvider implements FlightProvider {
  readonly strategy = 'SIMULATED';
  private readonly simulated = new SimulatedFlightProvider();
  candidateCalls: string[] = [];
  calendarCalls: string[] = [];
  /** Origem → erro da chamada de candidatos. */
  failCandidates = new Map<string, ProviderError>();
  /** Origem → promessa que segura a chamada de candidatos (single-flight). */
  holdCandidates = new Map<string, Promise<void>>();

  search: FlightProvider['search'] = (query, context) => this.simulated.search(query, context);

  allFlightsUrl(query: Parameters<NonNullable<FlightProvider['allFlightsUrl']>>[0]): string {
    return this.simulated.allFlightsUrl(query);
  }

  async cheapestByDestination(query: CheapestByDestinationQuery): Promise<DestinationFare[]> {
    this.candidateCalls.push(query.originIata);
    await this.holdCandidates.get(query.originIata);
    const failure = this.failCandidates.get(query.originIata);
    if (failure) throw failure;
    return Object.entries(FARES)
      .filter(([destination]) => destination !== query.originIata)
      .map(([destinationIata, fare]) => ({
        destinationIata,
        departureDate: DEPARTURE,
        returnDate: null,
        amountMinor: fare.amountMinor,
        stops: 0,
        observedAt: fare.observedAt ?? hoursAgo(1),
      }));
  }

  async priceCalendar(query: PriceCalendarQuery): Promise<CalendarDay[]> {
    this.calendarCalls.push(`${query.originIata}-${query.destinationIata}-${query.month}`);
    if (query.destinationIata === 'NYC') {
      throw new ProviderError('UNAVAILABLE', 'calendar down');
    }
    const amountMinor = REFERENCE[query.destinationIata] ?? 100_000;
    const days = daysOfMonth(query.month).map((date) => ({
      date,
      amountMinor,
      stops: 0,
      observedAt: hoursAgo(2),
    }));
    // DOU: 2 datas futuras por mês — no máximo 6, abaixo do mínimo de 8.
    return query.destinationIata === 'DOU'
      ? days.filter((day) => day.date > isoDate(0)).slice(0, 2)
      : days;
  }

  reset(): void {
    this.candidateCalls = [];
    this.calendarCalls = [];
    this.failCandidates.clear();
    this.holdCandidates.clear();
  }
}

let container: StartedPostgreSqlContainer;
const apps: NestFastifyApplication[] = [];

async function buildApp(
  env: Record<string, string>,
  provider: FlightProvider,
  store: KeyValueStore,
): Promise<NestFastifyApplication> {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FLIGHT_PROVIDER)
      .useValue(provider)
      .overrideProvider(KEY_VALUE_STORE)
      .useValue(store)
      .compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    registerCorrelationHook(app);
    await app.getHttpAdapter().getInstance().ready();
    apps.push(app);
    return app;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
}

let nextIp = 0;
/** Um IP de cliente por requisição: o rate limit da busca não interfere aqui. */
function freshClient(): Record<string, string> {
  nextIp += 1;
  return {
    [CLIENT_IP_HEADER]: `198.51.100.${nextIp % 250}`,
    [INTERNAL_SECRET_HEADER]: LOCAL_INTERNAL_API_SECRET,
  };
}

function promotions(app: NestFastifyApplication, query: Record<string, string | number>) {
  return request(app.getHttpServer()).get('/v1/promotions').query(query).set(freshClient());
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  const prisma = createPrismaClient(databaseUrl);
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
  await prisma.$disconnect();
}, 120_000);

afterAll(async () => {
  for (const app of apps) await app.close();
  await container?.stop();
});

describe('GET /v1/promotions — motor ligado', () => {
  const provider = new CountingProvider();
  const store = new MemoryKeyValueStore();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildApp({ PROMOTION_ENGINE_ENABLED: 'true' }, provider, store);
  });

  afterEach(() => provider.reset());

  // AC-8, EVAL-PROMO-002/003/004
  it('normaliza a origem e só devolve o que qualifica, com a base da comparação', async () => {
    const response = await promotions(app, { origin: 'gru' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ origin: 'SAO', originName: 'São Paulo', status: 'OK' });
    expect(
      response.body.promotions.map((item: { destination: string }) => item.destination),
    ).toEqual(['RIO']);
    const [rio] = response.body.promotions;
    expect(rio).toMatchObject({
      destinationName: 'Rio de Janeiro',
      scope: 'DOMESTIC',
      tripType: 'ONE_WAY',
      departureDate: DEPARTURE,
      returnDate: null,
      price: { amountMinor: 50_000, currency: 'BRL' },
      discountBps: 5000,
      absoluteSavingMinor: 50_000,
      scoreVersion: 1,
    });
    expect(rio.reference.amountMinor).toBe(100_000);
    expect(rio.reference.pointCount).toBeGreaterThanOrEqual(8);
    expect(rio.reference.months).toContain(DEPARTURE.slice(0, 7));
    expect(rio.reference.explanation).toContain('R$ 500 está 50% abaixo da mediana de');
    expect(rio.reference.explanation).toContain('São Paulo → Rio de Janeiro');
    expect(Date.parse(rio.observedAt)).toBeLessThanOrEqual(Date.now());
    expect(rio.score).toBeGreaterThan(0);
    expect(rio.purchaseUrl).toMatch(/^https:\/\/booking\.simulated-provider\.flightwatch\.dev\//);

    // 1 chamada de candidatos; BSB (velho) e ZZZ (fora do catálogo) nem viram candidatos.
    expect(provider.candidateCalls).toEqual(['SAO']);
    expect(provider.calendarCalls.some((call) => call.includes('-BSB-'))).toBe(false);
    expect(provider.calendarCalls.some((call) => call.includes('-ZZZ-'))).toBe(false);

    const metrics = await app.get(MetricsService).registry.metrics();
    expect(metrics).toContain('promotion_evaluations_total{result="suspect"} 1');
    expect(metrics).toContain('promotion_evaluations_total{result="not_promotional"} 1');
    expect(metrics).toContain('promotion_evaluations_total{result="insufficient_data"} 1');
    expect(metrics).toContain('promotion_feed_requests_total{cache="miss",result="ok"} 1');
  });

  // AC-6, EVAL-PROMO-005
  it('origem quente: 0 chamadas; o calendário da busca reaproveita o cache por rota-mês', async () => {
    const warm = await promotions(app, { origin: 'SAO' });
    expect(warm.status).toBe(200);
    expect(warm.body.promotions).toHaveLength(1);

    const calendar = await request(app.getHttpServer())
      .get('/v1/price-calendar')
      .query({ origin: 'SAO', destination: 'RIO', month: DEPARTURE.slice(0, 7) })
      .set(freshClient());
    expect(calendar.status).toBe(200);
    expect(calendar.body.days.length).toBeGreaterThan(0);

    expect(provider.candidateCalls).toEqual([]);
    expect(provider.calendarCalls).toEqual([]);
  });

  // AC-5
  it('filtra por escopo, ordena e limita sem recalcular', async () => {
    const international = await promotions(app, { origin: 'SAO', scope: 'international' });
    expect(international.body.promotions).toEqual([]);
    const limited = await promotions(app, { origin: 'SAO', sort: 'price', limit: 1 });
    expect(limited.body.promotions).toHaveLength(1);
    expect(provider.candidateCalls).toEqual([]);
  });

  // AC-6, EVAL-PROMO-005
  it('duas requisições simultâneas da mesma origem fria fazem um cálculo só', async () => {
    let release: () => void = () => undefined;
    provider.holdCandidates.set(
      'RIO',
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const first = promotions(app, { origin: 'RIO' }).then((response) => response);
    const second = promotions(app, { origin: 'RIO' }).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(provider.candidateCalls).toEqual(['RIO']);
  });

  // AC-8
  it('valida a entrada: origem desconhecida, ausente ou limite fora da faixa', async () => {
    const unknown = await promotions(app, { origin: 'ZZZ' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('UNSUPPORTED_SEARCH');
    expect((await promotions(app, {})).status).toBe(400);
    expect((await promotions(app, { origin: 'SAO', limit: 51 })).status).toBe(400);
  });

  // AC-8 / Falhas
  it('erro da fonte sem cache vira 502 PROVIDER_UNAVAILABLE', async () => {
    provider.failCandidates.set('LIS', new ProviderError('UNAVAILABLE', 'down'));
    const response = await promotions(app, { origin: 'LIS' });
    expect(response.status).toBe(502);
    expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
  });

  // Falhas: cache vencido serve de reserva com o generatedAt real.
  it('erro da fonte com cache vencido serve o cache antigo', async () => {
    const generatedAt = new Date(Date.now() - 7 * HOUR_MS).toISOString();
    const stalePromotion = {
      destination: 'RIO',
      destinationName: 'Rio de Janeiro',
      destinationCoordinates: null,
      scope: 'DOMESTIC',
      tripType: 'ONE_WAY',
      departureDate: DEPARTURE,
      returnDate: null,
      price: { amountMinor: 50_000, currency: 'BRL' },
      stops: 0,
      discountBps: 5000,
      absoluteSavingMinor: 50_000,
      reference: { amountMinor: 100_000, pointCount: 20, months: ['2026-11'], explanation: 'x' },
      observedAt: hoursAgo(10),
      score: 60,
      scoreVersion: 1,
    };
    await store.set(
      'promotions:v1:DOU:ONE_WAY:BRL:BR',
      JSON.stringify({ generatedAt, promotions: [stalePromotion] }),
      DAY_MS,
    );
    provider.failCandidates.set('DOU', new ProviderError('TIMEOUT', 'slow'));

    const response = await promotions(app, { origin: 'DOU' });

    expect(response.status).toBe(200);
    expect(response.body.generatedAt).toBe(generatedAt);
    expect(response.body.promotions).toHaveLength(1);
    expect(provider.candidateCalls).toEqual(['DOU']);
  });

  it('link de compra ganha o afiliado da superfície de oportunidade', async () => {
    const previous = process.env.AFFILIATE_TRACKING_PARAMS;
    process.env.AFFILIATE_TRACKING_PARAMS = '{"SIMULATED":{"marker":"fw-promo"}}';
    resetAffiliateConfigCache();
    try {
      const response = await promotions(app, { origin: 'SAO' });
      const url = new URL(response.body.promotions[0].purchaseUrl);
      expect(url.searchParams.get('marker')).toBe('fw-promo');
    } finally {
      if (previous === undefined) delete process.env.AFFILIATE_TRACKING_PARAMS;
      else process.env.AFFILIATE_TRACKING_PARAMS = previous;
      resetAffiliateConfigCache();
    }
  });
});

describe('GET /v1/promotions — 429 da fonte', () => {
  it('respeita o Retry-After: sem novas chamadas do feed até lá', async () => {
    const provider = new CountingProvider();
    const app = await buildApp(
      { PROMOTION_ENGINE_ENABLED: 'true' },
      provider,
      new MemoryKeyValueStore(),
    );
    provider.failCandidates.set(
      'SAO',
      new ProviderError('RATE_LIMITED', 'slow down', { retryAfterMs: 60_000 }),
    );

    expect((await promotions(app, { origin: 'SAO' })).status).toBe(502);
    const other = await promotions(app, { origin: 'RIO' });

    expect(other.status).toBe(502);
    expect(provider.candidateCalls).toEqual(['SAO']);
  });
});

describe('GET /v1/promotions — orçamento esgotado (AC-7, EVAL-PROMO-006)', () => {
  it('origem sem cache responde BUDGET_EXHAUSTED sem chamar a fonte; busca e calendário seguem', async () => {
    const provider = new CountingProvider();
    const app = await buildApp(
      { PROMOTION_ENGINE_ENABLED: 'true', PROMOTION_DAILY_CALL_BUDGET: '0' },
      provider,
      new MemoryKeyValueStore(),
    );

    const response = await promotions(app, { origin: 'SAO' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'BUDGET_EXHAUSTED', promotions: [] });
    expect(provider.candidateCalls).toEqual([]);
    expect(provider.calendarCalls).toEqual([]);

    const calendar = await request(app.getHttpServer())
      .get('/v1/price-calendar')
      .query({ origin: 'SAO', destination: 'RIO', month: DEPARTURE.slice(0, 7) })
      .set(freshClient());
    expect(calendar.status).toBe(200);
    expect(provider.calendarCalls).toHaveLength(1);

    const search = await request(app.getHttpServer())
      .post('/v1/searches/flights')
      .set(freshClient())
      .send({
        origin: 'SAO',
        destination: 'RIO',
        tripType: 'ONE_WAY',
        departureDate: DEPARTURE,
        returnDate: null,
        dateFlexibilityDays: 0,
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        maxStops: null,
        maxPriceMinor: null,
      });
    expect(search.status).toBe(201);
    expect(search.body.status).toBe('SUCCEEDED');
  });

  it('esgotado no meio da rodada: candidatos sem referência saem e nada fica no cache', async () => {
    const provider = new CountingProvider();
    const store = new MemoryKeyValueStore();
    // 1 de candidatos + 1 mês: o resto é recusado.
    const app = await buildApp(
      { PROMOTION_ENGINE_ENABLED: 'true', PROMOTION_DAILY_CALL_BUDGET: '2' },
      provider,
      store,
    );

    const response = await promotions(app, { origin: 'SAO' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('BUDGET_EXHAUSTED');
    expect(provider.candidateCalls).toHaveLength(1);
    expect(provider.calendarCalls).toHaveLength(1);
    expect(await store.get('promotions:v1:SAO:ONE_WAY:BRL:BR')).toBeNull();
  });
});

describe('GET /v1/promotions — kill switch (AC-10)', () => {
  it('desligado responde DISABLED sem chamar a fonte', async () => {
    const provider = new CountingProvider();
    const app = await buildApp(
      { PROMOTION_ENGINE_ENABLED: 'false' },
      provider,
      new MemoryKeyValueStore(),
    );

    const response = await promotions(app, { origin: 'SAO' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ origin: 'SAO', status: 'DISABLED', promotions: [] });
    expect(provider.candidateCalls).toEqual([]);
    expect(provider.calendarCalls).toEqual([]);
  });
});

describe('GET /v1/promotions — Redis fora', () => {
  it('calcula sem cache e nunca derruba a API', async () => {
    const broken: KeyValueStore = {
      get: async () => {
        throw new Error('redis down');
      },
      set: async () => {
        throw new Error('redis down');
      },
      increment: async () => {
        throw new Error('redis down');
      },
      close: async () => undefined,
    };
    const provider = new CountingProvider();
    const app = await buildApp({ PROMOTION_ENGINE_ENABLED: 'true' }, provider, broken);

    const response = await promotions(app, { origin: 'SAO' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(
      response.body.promotions.map((item: { destination: string }) => item.destination),
    ).toEqual(['RIO']);
  });
});
