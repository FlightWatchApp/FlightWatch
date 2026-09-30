import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from './client.js';
import {
  SearchTargetFingerprintConflictError,
  type SearchTargetCanonicalRecord,
  findOrCreateSearchTarget,
  withSearchTargetRaceRetry,
} from './search-target-repository.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

const baseRecord: SearchTargetCanonicalRecord = {
  fingerprint: 'fp-dou-gru-2026-12-20',
  canonicalKey:
    'schema=v1|origin=DOU|destination=GRU|departure=2026-12-20|return=-|trip=ONE_WAY|cabin=ECONOMY|adults=1|currency=BRL|market=BR',
  originIata: 'DOU',
  destinationIata: 'GRU',
  departureDate: '2026-12-20',
  returnDate: null,
  tripType: 'ONE_WAY',
  cabin: 'ECONOMY',
  adults: 1,
  currency: 'BRL',
  market: 'BR',
};

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

describe('findOrCreateSearchTarget (Postgres real via Testcontainers)', () => {
  // EVAL-DEDUP-001: N usuários com a mesma busca convergem para 1 SearchTarget,
  // mesmo em concorrência real (não simulada).
  it('converges 50 concurrent equivalent requests onto a single SearchTarget', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        withSearchTargetRaceRetry(() =>
          prisma.$transaction((tx) => findOrCreateSearchTarget(tx, baseRecord)),
        ),
      ),
    );

    expect(new Set(results.map((r) => r.id)).size).toBe(1);

    const rowCount = await prisma.searchTarget.count({
      where: { fingerprint: baseRecord.fingerprint },
    });
    expect(rowCount).toBe(1);
  });

  // EVAL-DEDUP-002: diferença material (data) produz um SearchTarget distinto.
  it('creates a distinct SearchTarget for a materially different search', async () => {
    const otherRecord: SearchTargetCanonicalRecord = {
      ...baseRecord,
      fingerprint: 'fp-dou-gru-2026-12-21',
      departureDate: '2026-12-21',
    };

    const [first, second] = await Promise.all([
      withSearchTargetRaceRetry(() =>
        prisma.$transaction((tx) => findOrCreateSearchTarget(tx, baseRecord)),
      ),
      withSearchTargetRaceRetry(() =>
        prisma.$transaction((tx) => findOrCreateSearchTarget(tx, otherRecord)),
      ),
    ]);

    expect(first.id).not.toBe(second.id);
  });

  it('is idempotent across sequential calls', async () => {
    const record: SearchTargetCanonicalRecord = {
      ...baseRecord,
      fingerprint: 'fp-sequential-test',
    };
    const firstCall = await withSearchTargetRaceRetry(() =>
      prisma.$transaction((tx) => findOrCreateSearchTarget(tx, record)),
    );
    const secondCall = await withSearchTargetRaceRetry(() =>
      prisma.$transaction((tx) => findOrCreateSearchTarget(tx, record)),
    );
    expect(firstCall.id).toBe(secondCall.id);
  });

  // SPEC-001 §6: colisão teórica de fingerprint com campos divergentes falha
  // com segurança em vez de associar a busca ao target errado.
  it('throws when the same fingerprint carries divergent canonical fields', async () => {
    const record: SearchTargetCanonicalRecord = { ...baseRecord, fingerprint: 'fp-collision-test' };
    await withSearchTargetRaceRetry(() =>
      prisma.$transaction((tx) => findOrCreateSearchTarget(tx, record)),
    );

    const divergentRecord: SearchTargetCanonicalRecord = { ...record, destinationIata: 'GIG' };

    await expect(
      withSearchTargetRaceRetry(() =>
        prisma.$transaction((tx) => findOrCreateSearchTarget(tx, divergentRecord)),
      ),
    ).rejects.toThrow(SearchTargetFingerprintConflictError);
  });
});
