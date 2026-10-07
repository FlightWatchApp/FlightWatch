import { execSync } from 'node:child_process';
import path from 'node:path';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import {
  type FlightProvider,
  ProviderError,
  SimulatedFlightProvider,
} from '@flight-watch/providers';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FLIGHT_PROVIDER } from './flight-provider.token.js';

/** SPEC-031 — calendário de preços e "ver todos os voos", Postgres real. */
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;

/** Simulado, mas com o calendário indisponível para Miami (AC-5). */
const simulated = new SimulatedFlightProvider();
const provider: FlightProvider = {
  strategy: simulated.strategy,
  search: (query, context) => simulated.search(query, context),
  priceCalendar: async (query) => {
    if (query.destinationIata === 'MIA') {
      throw new ProviderError('UNAVAILABLE', 'calendar source down');
    }
    return simulated.priceCalendar(query);
  },
  allFlightsUrl: (query) => simulated.allFlightsUrl(query),
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
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FLIGHT_PROVIDER)
    .useValue(provider)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();
  await syncPlacesCatalog(app.get(PrismaService).client, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

function calendar(query: Record<string, string | number>) {
  return request(app.getHttpServer()).get('/v1/price-calendar').query(query);
}

describe('GET /v1/price-calendar (SPEC-031 AC-2)', () => {
  it('normaliza para cidade e devolve os dias do mês em ordem', async () => {
    const response = await calendar({ origin: 'GRU', destination: 'LIS', month: '2027-02' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      origin: 'SAO',
      destination: 'LIS',
      month: '2027-02',
      currency: 'BRL',
    });
    const dates = response.body.days.map((day: { date: string }) => day.date);
    expect(dates).toHaveLength(28);
    expect(dates).toEqual([...dates].sort());
  });

  it('valida mês, duração da ida e volta e cidades', async () => {
    expect((await calendar({ origin: 'SAO', destination: 'LIS', month: '2027-13' })).status).toBe(
      400,
    );
    expect(
      (
        await calendar({
          origin: 'SAO',
          destination: 'LIS',
          month: '2027-02',
          tripType: 'ROUND_TRIP',
        })
      ).status,
    ).toBe(400);
    const unknown = await calendar({ origin: 'ZZZ', destination: 'LIS', month: '2027-02' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('UNSUPPORTED_SEARCH');
  });

  // AC-5
  it('fonte indisponível vira 502 PROVIDER_UNAVAILABLE', async () => {
    const response = await calendar({ origin: 'SAO', destination: 'MIA', month: '2027-02' });
    expect(response.status).toBe(502);
    expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
  });
});

describe('allFlightsUrl na busca (SPEC-031 AC-3)', () => {
  it('vem validado na resposta da busca e na leitura posterior', async () => {
    const created = await request(app.getHttpServer()).post('/v1/searches/flights').send({
      origin: 'SAO',
      destination: 'LIS',
      tripType: 'ONE_WAY',
      departureDate: '2027-02-10',
      returnDate: null,
      dateFlexibilityDays: 0,
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      maxStops: null,
      maxPriceMinor: 1, // filtra tudo: o link continua lá
    });

    expect(created.status).toBe(201);
    expect(created.body.offers).toEqual([]);
    const expected = 'https://booking.simulated-provider.flightwatch.dev/search/SAO-LIS-2027-02-10';
    expect(created.body.allFlightsUrl).toMatch(new RegExp(`^${expected}`));

    const fetched = await request(app.getHttpServer()).get(
      `/v1/searches/flights/${created.body.id}`,
    );
    expect(fetched.body.allFlightsUrl).toBe(created.body.allFlightsUrl);
  });
});
