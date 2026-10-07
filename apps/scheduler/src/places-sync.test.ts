import { execSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PrismaClient,
  TEST_PLACES,
  createPrismaClient,
  getPlacesLastSyncedAt,
} from '@flight-watch/database';
import { ProviderError, type ParsedPlaces } from '@flight-watch/providers';
import { createSchedulerMetrics } from './metrics.js';
import { runPlacesSync } from './places-sync.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });
  prisma = createPrismaClient(container.getConnectionUri());
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

beforeEach(async () => {
  await prisma.place.deleteMany();
});

const parsed: ParsedPlaces = {
  places: [...TEST_PLACES],
  invalid: { cities: 3, airports: 1 },
  ignored: { nonAirportTypes: 2 },
};

function fakeSource(result: ParsedPlaces | Error = parsed) {
  return vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
}

describe('runPlacesSync (SPEC-029)', () => {
  it('sincroniza quando o catálogo está vazio', async () => {
    const fetchPlaces = fakeSource();
    const metrics = createSchedulerMetrics();
    const now = new Date('2026-10-06T12:00:00Z');

    const outcome = await runPlacesSync({ prisma, fetchPlaces, metrics, now: () => now });

    expect(outcome).toBe('success');
    expect(fetchPlaces).toHaveBeenCalledTimes(1);
    expect(await prisma.place.count()).toBe(TEST_PLACES.length);
    expect(await getPlacesLastSyncedAt(prisma)).toEqual(now);
    const exposition = await metrics.registry.metrics();
    expect(exposition).toContain('places_sync_total{result="success"} 1');
    expect(exposition).toContain(
      `places_sync_records{kind="all",outcome="upserted"} ${TEST_PLACES.length}`,
    );
    expect(exposition).toContain('places_sync_records{kind="city",outcome="invalid"} 3');
  });

  // AC-4
  it('não baixa de novo um catálogo com menos de 7 dias', async () => {
    await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource(),
      metrics: createSchedulerMetrics(),
      now: () => new Date('2026-10-01T12:00:00Z'),
    });
    const fetchPlaces = fakeSource();
    const metrics = createSchedulerMetrics();

    const outcome = await runPlacesSync({
      prisma,
      fetchPlaces,
      metrics,
      now: () => new Date('2026-10-06T12:00:00Z'),
    });

    expect(outcome).toBe('skipped_fresh');
    expect(fetchPlaces).not.toHaveBeenCalled();
    expect(await metrics.registry.metrics()).toContain(
      'places_sync_total{result="skipped_fresh"} 1',
    );
  });

  it('baixa de novo um catálogo com 7 dias ou mais', async () => {
    await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource(),
      metrics: createSchedulerMetrics(),
      now: () => new Date('2026-09-28T12:00:00Z'),
    });
    const fetchPlaces = fakeSource();

    const outcome = await runPlacesSync({
      prisma,
      fetchPlaces,
      metrics: createSchedulerMetrics(),
      now: () => new Date('2026-10-06T12:00:00Z'),
    });

    expect(outcome).toBe('success');
    expect(fetchPlaces).toHaveBeenCalledTimes(1);
  });

  it('o comando manual força a sincronização mesmo com catálogo recente', async () => {
    const now = () => new Date('2026-10-06T12:00:00Z');
    await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource(),
      metrics: createSchedulerMetrics(),
      now,
    });
    const fetchPlaces = fakeSource();

    const outcome = await runPlacesSync({
      prisma,
      fetchPlaces,
      metrics: createSchedulerMetrics(),
      now,
      force: true,
    });

    expect(outcome).toBe('success');
    expect(fetchPlaces).toHaveBeenCalledTimes(1);
  });

  it('falha da fonte mantém o catálogo anterior e não lança', async () => {
    await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource(),
      metrics: createSchedulerMetrics(),
      now: () => new Date('2026-09-01T00:00:00Z'),
    });
    const metrics = createSchedulerMetrics();

    const outcome = await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource(
        new ProviderError('UNAVAILABLE', 'places source: cities returned 503'),
      ),
      metrics,
      now: () => new Date('2026-10-06T12:00:00Z'),
    });

    expect(outcome).toBe('failed');
    expect(await prisma.place.count()).toBe(TEST_PLACES.length);
    expect(await metrics.registry.metrics()).toContain('places_sync_total{result="failed"} 1');
  });

  it('fonte que devolve catálogo vazio é tratada como falha, sem desativar tudo', async () => {
    await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource(),
      metrics: createSchedulerMetrics(),
      now: () => new Date('2026-09-01T00:00:00Z'),
    });

    const outcome = await runPlacesSync({
      prisma,
      fetchPlaces: fakeSource({
        places: [],
        invalid: { cities: 0, airports: 0 },
        ignored: { nonAirportTypes: 0 },
      }),
      metrics: createSchedulerMetrics(),
      now: () => new Date('2026-10-06T12:00:00Z'),
    });

    expect(outcome).toBe('failed');
    expect(await prisma.place.count({ where: { searchable: true } })).toBeGreaterThan(0);
  });
});
