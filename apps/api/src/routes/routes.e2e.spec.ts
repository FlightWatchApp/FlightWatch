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
import { estimateDirectFlightMinutes, greatCircleKm } from '@flight-watch/domain';
import {
  type CalendarDay,
  type CheapestByDestinationQuery,
  type DestinationFare,
  type FlightProvider,
  type PriceCalendarQuery,
  ProviderError,
  SimulatedFlightProvider,
} from '@flight-watch/providers';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
  MemoryKeyValueStore,
} from '../pricing-source/key-value-store.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';
import { routeMonths } from './routes.service.js';

/** SPEC-033 — GET /v1/routes/{origin}/{destination}, Postgres real e provedor contado. */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

const MONTHS = routeMonths(new Date(), 3);

/**
 * Por mês consultado, 3 datas: ontem (passado), daqui a 10 dias (R$ 1.000) e
 * daqui a 12 dias (R$ 800), mais uma vista há 80 h (inválida). LIS não tem
 * preço; MIA dá erro na fonte.
 */
class CountingProvider implements FlightProvider {
  readonly strategy = 'SIMULATED';
  private readonly simulated = new SimulatedFlightProvider();
  calendarCalls: string[] = [];
  candidateCalls = 0;
  failNext: ProviderError | null = null;

  search: FlightProvider['search'] = (query, context) => this.simulated.search(query, context);

  allFlightsUrl(query: Parameters<NonNullable<FlightProvider['allFlightsUrl']>>[0]): string {
    return this.simulated.allFlightsUrl(query);
  }

  async cheapestByDestination(query: CheapestByDestinationQuery): Promise<DestinationFare[]> {
    this.candidateCalls += 1;
    if (query.originIata !== 'SAO') return [];
    return [
      {
        destinationIata: 'NYC',
        departureDate: isoDate(12),
        returnDate: null,
        amountMinor: 60_000,
        stops: 0,
        observedAt: hoursAgo(1),
      },
    ];
  }

  async priceCalendar(query: PriceCalendarQuery): Promise<CalendarDay[]> {
    this.calendarCalls.push(`${query.originIata}-${query.destinationIata}-${query.month}`);
    if (this.failNext) {
      const failure = this.failNext;
      this.failNext = null;
      throw failure;
    }
    if (query.destinationIata === 'MIA') {
      throw new ProviderError('UNAVAILABLE', 'calendar down');
    }
    if (query.destinationIata === 'LIS') return [];
    if (query.month !== MONTHS[0]) {
      // Meses seguintes: muitas datas a R$ 1.000 (referência para a promoção).
      return Array.from({ length: 20 }, (_, i) => ({
        date: `${query.month}-${String(i + 1).padStart(2, '0')}`,
        amountMinor: 100_000,
        stops: 0,
        observedAt: hoursAgo(2),
      }));
    }
    return [
      { date: isoDate(-1), amountMinor: 50_000, stops: 0, observedAt: hoursAgo(2) },
      { date: isoDate(10), amountMinor: 100_000, stops: 0, observedAt: hoursAgo(2) },
      { date: isoDate(12), amountMinor: 80_000, stops: 1, observedAt: hoursAgo(2) },
      { date: isoDate(14), amountMinor: 10_000, stops: 0, observedAt: hoursAgo(80) },
    ].filter((day) => day.date.startsWith(query.month));
  }

  reset(): void {
    this.calendarCalls = [];
    this.candidateCalls = 0;
    this.failNext = null;
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

function route(app: NestFastifyApplication, origin: string, destination: string) {
  return request(app.getHttpServer()).get(`/v1/routes/${origin}/${destination}`).set(freshClient());
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

describe('GET /v1/routes — página ligada', () => {
  const provider = new CountingProvider();
  let store: MemoryKeyValueStore;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    store = new MemoryKeyValueStore();
    app = await buildApp(
      { ROUTE_PAGE_ENABLED: 'true', PROMOTION_ENGINE_ENABLED: 'true' },
      provider,
      store,
    );
  });

  afterEach(() => provider.reset());

  // AC-1, AC-2, AC-3
  it('normaliza para cidade e devolve lugares, fatos calculados e preços numa chamada', async () => {
    const response = await route(app, 'gru', 'dou');

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body.origin).toMatchObject({
      code: 'SAO',
      name: 'São Paulo',
      countryName: 'Brasil',
      coordinates: { latitude: -23.55, longitude: -46.63 },
      airports: [
        { code: 'CGH', name: 'Congonhas' },
        { code: 'GRU', name: 'Guarulhos' },
      ],
    });
    expect(body.destination.code).toBe('DOU');
    const km = greatCircleKm(
      { latitude: -23.55, longitude: -46.63 },
      {
        latitude: body.destination.coordinates.latitude,
        longitude: body.destination.coordinates.longitude,
      },
    );
    expect(body.distanceKm).toBe(km);
    expect(body.estimatedDirectFlightMinutes).toBe(estimateDirectFlightMinutes(km));

    expect(body.prices.status).toBe('OK');
    expect(body.prices.months).toEqual(MONTHS);
    // Data passada e preço com mais de 72 h ficam fora.
    expect(body.prices.days.some((day: { date: string }) => day.date === isoDate(-1))).toBe(false);
    expect(
      body.prices.days.some((day: { amountMinor: number }) => day.amountMinor === 10_000),
    ).toBe(false);
    expect(body.prices.cheapest).toMatchObject({ date: isoDate(12), amountMinor: 80_000 });
    expect(body.prices.referenceMedianMinor).toBeGreaterThan(0);
    expect(body.allFlightsUrl).toMatch(
      /^https:\/\/booking\.simulated-provider\.flightwatch\.dev\//,
    );
    expect(provider.calendarCalls).toHaveLength(3);
  });

  // EVAL-ROUTE-002 / AC-4: o contrato não tem campo de companhia, dia da semana nem classe.
  it('nenhuma companhia, dia da semana ou classe na resposta', async () => {
    const response = await route(app, 'SAO', 'DOU');
    const text = JSON.stringify(response.body);
    expect(text).not.toMatch(/airline|weekday|cabin|alliance/i);
  });

  it('segunda abertura sai do cache da rota: 0 chamadas', async () => {
    await route(app, 'SAO', 'RIO');
    provider.reset();
    const response = await route(app, 'SAO', 'RIO');
    expect(response.status).toBe(200);
    expect(provider.calendarCalls).toHaveLength(0);
  });

  // AC-1
  it('cidade igual, desconhecida ou fora do catálogo → 404; código inválido → 400', async () => {
    expect((await route(app, 'GRU', 'CGH')).status).toBe(404);
    expect((await route(app, 'SAO', 'ZZZ')).status).toBe(404);
    expect((await route(app, 'SAO', 'VSV')).body.code).toBe('ROUTE_NOT_FOUND');
    expect((await route(app, 'SAOP', 'DOU')).status).toBe(400);
  });

  // AC-5
  it('rota sem preço: NO_PRICES, sem mais barato nem mediana', async () => {
    const response = await route(app, 'SAO', 'LIS');
    expect(response.body.prices).toMatchObject({
      status: 'NO_PRICES',
      days: [],
      cheapest: null,
      referenceMedianMinor: null,
    });
    expect(response.body.allFlightsUrl).not.toBeNull();
  });

  // AC-5: fonte fora ≠ sem preço, e não vai ao cache.
  it('fonte fora sem cache: UNAVAILABLE e tenta de novo na próxima', async () => {
    const first = await route(app, 'SAO', 'MIA');
    expect(first.body.prices.status).toBe('UNAVAILABLE');
    provider.reset();
    await route(app, 'SAO', 'MIA');
    expect(provider.calendarCalls.length).toBeGreaterThan(0);
  });

  it('promoção só do feed já em cache: a página nunca calcula o feed', async () => {
    const before = await route(app, 'SAO', 'BSB');
    expect(before.body.promotion).toBeNull();

    const feed = await request(app.getHttpServer())
      .get('/v1/promotions')
      .query({ origin: 'SAO' })
      .set(freshClient());
    expect(feed.body.promotions.map((p: { destination: string }) => p.destination)).toContain(
      'NYC',
    );

    // SAO → NYC ainda não foi aberta: a página lê a promoção do feed em cache.
    const after = await route(app, 'SAO', 'NYC');
    expect(after.body.promotion).toMatchObject({ amountMinor: 60_000, departureDate: isoDate(12) });
    expect(after.body.promotion.explanation).toContain('abaixo da mediana');
  });
});

describe('GET /v1/routes — orçamento e Retry-After', () => {
  // AC-6, EVAL-ROUTE-007
  it('orçamento da página esgotado não chama a fonte e responde UPDATING', async () => {
    const provider = new CountingProvider();
    const app = await buildApp(
      { ROUTE_PAGE_ENABLED: 'true', ROUTE_PAGE_DAILY_CALL_BUDGET: '2' },
      provider,
      new MemoryKeyValueStore(),
    );

    const first = await route(app, 'SAO', 'DOU');
    expect(first.body.prices.status).toBe('UPDATING');
    expect(first.body.prices.days.length).toBeGreaterThan(0);

    for (const destination of ['RIO', 'BSB', 'NYC', 'LIS']) {
      const response = await route(app, 'SAO', destination);
      expect(response.status).toBe(200);
      expect(response.body.prices.status).toBe('UPDATING');
    }
    expect(provider.calendarCalls).toHaveLength(2);
  });

  it('429 na página pausa também o feed de promoções (Retry-After compartilhado)', async () => {
    const provider = new CountingProvider();
    const app = await buildApp(
      { ROUTE_PAGE_ENABLED: 'true', PROMOTION_ENGINE_ENABLED: 'true' },
      provider,
      new MemoryKeyValueStore(),
    );
    provider.failNext = new ProviderError('RATE_LIMITED', 'slow down', { retryAfterMs: 60_000 });

    const page = await route(app, 'SAO', 'DOU');
    expect(page.body.prices.status).toBe('UPDATING');
    const callsAfterPage = provider.calendarCalls.length;

    await request(app.getHttpServer())
      .get('/v1/promotions')
      .query({ origin: 'SAO' })
      .set(freshClient());
    // Durante a pausa o feed não consultou a fonte (nem candidatos, nem calendário).
    expect(provider.candidateCalls).toBe(0);
    expect(provider.calendarCalls.length).toBe(callsAfterPage);
  });
});

describe('GET /v1/routes — rate limit próprio (pages)', () => {
  // Uma visita pré-carrega links: a página tem limite próprio, mais folgado que a busca.
  it('conta por IP no throttler da página, separado da busca', async () => {
    const provider = new CountingProvider();
    const app = await buildApp(
      { ROUTE_PAGE_ENABLED: 'true', RATE_LIMIT_MAX: '2', ROUTE_PAGE_RATE_LIMIT_MAX: '4' },
      provider,
      new MemoryKeyValueStore(),
    );
    const sameIp = {
      [CLIENT_IP_HEADER]: '203.0.113.7',
      [INTERNAL_SECRET_HEADER]: LOCAL_INTERNAL_API_SECRET,
    };
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const response = await request(app.getHttpServer()).get('/v1/routes/SAO/DOU').set(sameIp);
      statuses.push(response.status);
    }
    // Acima do limite da busca (2), dentro do da página (4); a 5ª é recusada.
    expect(statuses).toEqual([200, 200, 200, 200, 429]);
  });
});

describe('GET /v1/routes — página desligada (padrão)', () => {
  // Kill switch (SPEC-033 §Rollout)
  it('responde 404 sem consultar nada', async () => {
    const provider = new CountingProvider();
    const app = await buildApp({}, provider, new MemoryKeyValueStore());
    const response = await route(app, 'SAO', 'DOU');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    expect(provider.calendarCalls).toHaveLength(0);
  });
});
