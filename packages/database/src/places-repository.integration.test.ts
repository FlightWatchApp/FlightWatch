import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from './client.js';
import {
  findPlaceSummaries,
  findSearchableCities,
  getPlacesLastSyncedAt,
  resolveSearchableCityCode,
  searchCities,
  syncPlacesCatalog,
} from './places-repository.js';
import { TEST_PLACES, testAirport, testCity } from './places-test-fixture.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
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

describe('syncPlacesCatalog (SPEC-029, Postgres real)', () => {
  it('grava cidades e aeroportos e informa a última sincronização', async () => {
    expect(await getPlacesLastSyncedAt(prisma)).toBeNull();
    const syncedAt = new Date('2026-10-06T12:00:00Z');

    const result = await syncPlacesCatalog(prisma, TEST_PLACES, syncedAt);

    expect(result).toEqual({ upserted: TEST_PLACES.length, disabled: 0 });
    expect(await prisma.place.count()).toBe(TEST_PLACES.length);
    expect(await getPlacesLastSyncedAt(prisma)).toEqual(syncedAt);
  });

  it('atualiza o que já existe sem duplicar', async () => {
    await syncPlacesCatalog(prisma, TEST_PLACES, new Date('2026-10-01T00:00:00Z'));
    const renamed = TEST_PLACES.map((place) =>
      place.kind === 'CITY' && place.code === 'SAO' ? { ...place, name: 'São Paulo (SP)' } : place,
    );

    await syncPlacesCatalog(prisma, renamed, new Date('2026-10-06T00:00:00Z'));

    expect(await prisma.place.count()).toBe(TEST_PLACES.length);
    const sao = await prisma.place.findUniqueOrThrow({
      where: { code_kind: { code: 'SAO', kind: 'CITY' } },
    });
    expect(sao.name).toBe('São Paulo (SP)');
  });

  // AC-3
  it('lugar que sumiu da fonte vira não pesquisável, sem ser apagado', async () => {
    await syncPlacesCatalog(prisma, TEST_PLACES, new Date('2026-10-01T00:00:00Z'));
    const withoutLisbon = TEST_PLACES.filter((place) => place.cityCode !== 'LIS');

    const result = await syncPlacesCatalog(prisma, withoutLisbon, new Date('2026-10-06T00:00:00Z'));

    expect(result.disabled).toBe(2); // cidade LIS + aeroporto LIS
    const lisbon = await prisma.place.findUniqueOrThrow({
      where: { code_kind: { code: 'LIS', kind: 'CITY' } },
    });
    expect(lisbon.searchable).toBe(false);
  });

  it('suporta o volume real em lotes (20 mil registros)', async () => {
    const many = Array.from({ length: 20_000 }, (_, index) => {
      const code = `Z${String(index).padStart(5, '0')}`;
      return testCity({ code, name: `Cidade ${index}` });
    });

    const result = await syncPlacesCatalog(prisma, many, new Date('2026-10-06T00:00:00Z'));

    expect(result.upserted).toBe(20_000);
    expect(await prisma.place.count()).toBe(20_000);
  }, 120_000);
});

describe('searchCities (SPEC-029 AC-5)', () => {
  beforeEach(async () => {
    await syncPlacesCatalog(prisma, TEST_PLACES, new Date('2026-10-06T00:00:00Z'));
  });

  it('acha São Paulo pelo nome sem acento, com seus aeroportos comerciais', async () => {
    const [first] = await searchCities(prisma, 'sao paulo', 8);
    expect(first).toEqual({
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

  it('código de aeroporto leva à cidade dele em primeiro', async () => {
    const results = await searchCities(prisma, 'GRU', 8);
    expect(results[0]?.code).toBe('SAO');
  });

  it('acha Nova Iorque digitando "nova york" e Lisboa por "lisboa"', async () => {
    expect((await searchCities(prisma, 'nova york', 8))[0]?.code).toBe('NYC');
    expect((await searchCities(prisma, 'lisboa', 8))[0]?.code).toBe('LIS');
  });

  it('não devolve cidade sem aeroporto comercial nem texto curto', async () => {
    expect(await searchCities(prisma, 'vila sem voo', 8)).toEqual([]);
    expect(await searchCities(prisma, 's', 8)).toEqual([]);
  });

  it('respeita o limite', async () => {
    expect(await searchCities(prisma, 'brasil', 1)).toHaveLength(1);
  });
});

describe('resolveSearchableCityCode (SPEC-029 AC-6/AC-7)', () => {
  beforeEach(async () => {
    await syncPlacesCatalog(prisma, TEST_PLACES, new Date('2026-10-06T00:00:00Z'));
  });

  it('cidade pesquisável continua ela mesma', async () => {
    expect(await resolveSearchableCityCode(prisma, 'SAO')).toBe('SAO');
  });

  it('aeroporto vira a cidade dele', async () => {
    expect(await resolveSearchableCityCode(prisma, 'GRU')).toBe('SAO');
    expect(await resolveSearchableCityCode(prisma, 'JFK')).toBe('NYC');
  });

  it('código igual de cidade e aeroporto (LIS) resolve para a cidade', async () => {
    expect(await resolveSearchableCityCode(prisma, 'LIS')).toBe('LIS');
  });

  it('código desconhecido ou sem voo comercial devolve null', async () => {
    expect(await resolveSearchableCityCode(prisma, 'ZZZ')).toBeNull();
    expect(await resolveSearchableCityCode(prisma, 'VSV')).toBeNull();
  });
});

describe('findPlaceSummaries (SPEC-029 AC-8)', () => {
  beforeEach(async () => {
    await syncPlacesCatalog(
      prisma,
      [
        ...TEST_PLACES,
        testAirport({ code: 'OLD', cityCode: 'SAO', name: 'Antigo', searchable: false }),
      ],
      new Date('2026-10-06T00:00:00Z'),
    );
  });

  it('devolve nome e coordenadas por código de cidade', async () => {
    const summaries = await findPlaceSummaries(prisma, ['SAO', 'NYC']);
    expect(summaries.get('SAO')).toEqual({ name: 'São Paulo', lat: -23.55, lng: -46.63 });
    expect(summaries.get('NYC')?.name).toBe('Nova Iorque');
  });

  it('código de aeroporto (monitoramento antigo) mostra a cidade dele', async () => {
    const summaries = await findPlaceSummaries(prisma, ['GRU', 'OLD']);
    expect(summaries.get('GRU')?.name).toBe('São Paulo');
    expect(summaries.get('OLD')?.name).toBe('São Paulo');
  });

  it('código desconhecido fica de fora', async () => {
    const summaries = await findPlaceSummaries(prisma, ['ZZZ']);
    expect(summaries.has('ZZZ')).toBe(false);
  });
});

describe('findSearchableCities (SPEC-032)', () => {
  beforeEach(async () => {
    await syncPlacesCatalog(prisma, TEST_PLACES, new Date('2026-10-06T00:00:00Z'));
  });

  it('devolve nome, país e coordenadas só de cidades pesquisáveis', async () => {
    const cities = await findSearchableCities(prisma, ['SAO', 'LIS', 'GRU', 'VSV', 'ZZZ', 'SAO']);
    expect([...cities.keys()].sort()).toEqual(['LIS', 'SAO']);
    expect(cities.get('SAO')).toEqual({
      code: 'SAO',
      name: 'São Paulo',
      countryCode: 'BR',
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(cities.get('LIS')?.countryCode).toBe('PT');
  });

  it('lista vazia não consulta', async () => {
    expect((await findSearchableCities(prisma, [])).size).toBe(0);
  });
});
