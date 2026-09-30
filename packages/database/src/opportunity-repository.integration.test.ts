import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from './client.js';
import {
  findLatestObservationForSearchTarget,
  findLowestEverObservation,
  listCandidateSearchTargetsForOpportunities,
  summarizeObservationStats,
} from './opportunity-repository.js';

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

async function createSearchTarget(
  overrides: Partial<Parameters<typeof prisma.searchTarget.create>[0]['data']> = {},
) {
  return prisma.searchTarget.create({
    data: {
      fingerprint: `fp-${randomUUID()}`,
      canonicalKey: `canonical-${randomUUID()}`,
      originIata: 'DOU',
      destinationIata: 'GRU',
      departureDate: new Date('2027-03-01'),
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

async function seedObservation(searchTargetId: string, totalAmountMinor: number, observedAt: Date) {
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
      itinerary: [],
      offerSignature: randomUUID(),
      qualityFlags: [],
      observationKey: randomUUID(),
      selectionPolicyVersion: 1,
      normalizerVersion: 1,
    },
  });
}

describe('listCandidateSearchTargetsForOpportunities (Postgres real via Testcontainers)', () => {
  it('excludes INACTIVE targets and targets with a past departureDate', async () => {
    const asOf = new Date('2027-01-01');
    const active = await createSearchTarget({ departureDate: new Date('2027-06-01') });
    await createSearchTarget({ departureDate: new Date('2027-06-01'), status: 'INACTIVE' });
    await createSearchTarget({ departureDate: new Date('2026-01-01') });

    const candidates = await listCandidateSearchTargetsForOpportunities(prisma, { asOf });

    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(active.id);
    expect(candidates.every((c) => c.departureDate >= asOf)).toBe(true);
  });

  it('respects the limit and orders by soonest departure first', async () => {
    const asOf = new Date('2027-01-01');
    const later = await createSearchTarget({ departureDate: new Date('2027-08-01') });
    const sooner = await createSearchTarget({ departureDate: new Date('2027-02-01') });

    const candidates = await listCandidateSearchTargetsForOpportunities(prisma, {
      asOf,
      limit: 1000,
    });
    const soonerIndex = candidates.findIndex((c) => c.id === sooner.id);
    const laterIndex = candidates.findIndex((c) => c.id === later.id);
    expect(soonerIndex).toBeLessThan(laterIndex);

    const limited = await listCandidateSearchTargetsForOpportunities(prisma, { asOf, limit: 1 });
    expect(limited).toHaveLength(1);
  });
});

describe('summarizeObservationStats (Postgres real via Testcontainers)', () => {
  it('computes count/min/avg for multiple targets in a single call', async () => {
    const targetA = await createSearchTarget();
    const targetB = await createSearchTarget();
    await seedObservation(targetA.id, 100_000, new Date('2027-01-01'));
    await seedObservation(targetA.id, 80_000, new Date('2027-01-02'));
    await seedObservation(targetA.id, 90_000, new Date('2027-01-03'));
    await seedObservation(targetB.id, 50_000, new Date('2027-01-01'));
    await seedObservation(targetB.id, 60_000, new Date('2027-01-02'));

    const stats = await summarizeObservationStats(prisma, [targetA.id, targetB.id]);

    expect(stats.get(targetA.id)).toEqual({
      searchTargetId: targetA.id,
      observationCount: 3,
      lowestAmountMinor: 80_000,
      averageAmountMinor: 90_000,
    });
    expect(stats.get(targetB.id)).toEqual({
      searchTargetId: targetB.id,
      observationCount: 2,
      lowestAmountMinor: 50_000,
      averageAmountMinor: 55_000,
    });
  });

  it('excludes targets with fewer than MIN_OBSERVATIONS_FOR_REFERENCE observations', async () => {
    const target = await createSearchTarget();
    await seedObservation(target.id, 100_000, new Date('2027-01-01'));

    const stats = await summarizeObservationStats(prisma, [target.id]);

    expect(stats.has(target.id)).toBe(false);
  });

  it('returns an empty map for an empty input', async () => {
    const stats = await summarizeObservationStats(prisma, []);
    expect(stats.size).toBe(0);
  });
});

describe('findLowestEverObservation (Postgres real via Testcontainers)', () => {
  it('finds the lowest price regardless of insertion order, unscoped by any watch', async () => {
    const target = await createSearchTarget();
    await seedObservation(target.id, 100_000, new Date('2027-01-01'));
    await seedObservation(target.id, 60_000, new Date('2027-01-03'));
    await seedObservation(target.id, 80_000, new Date('2027-01-02'));

    const lowest = await findLowestEverObservation(prisma, target.id);

    expect(lowest?.totalAmountMinor).toBe(60_000);
  });

  it('returns null for a target with no observations', async () => {
    const target = await createSearchTarget();
    const lowest = await findLowestEverObservation(prisma, target.id);
    expect(lowest).toBeNull();
  });
});

describe('findLatestObservationForSearchTarget (Postgres real via Testcontainers)', () => {
  it('returns the most recently observed row, not the cheapest', async () => {
    const target = await createSearchTarget();
    await seedObservation(target.id, 60_000, new Date('2027-01-01'));
    await seedObservation(target.id, 100_000, new Date('2027-01-05'));

    const latest = await findLatestObservationForSearchTarget(prisma, target.id);

    expect(latest?.totalAmountMinor).toBe(100_000);
  });
});
