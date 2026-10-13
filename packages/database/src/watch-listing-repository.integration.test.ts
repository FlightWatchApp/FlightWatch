import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listWatchesForUser } from './watch-listing-repository.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let queryCount = 0;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({
    datasourceUrl: container.getConnectionUri(),
    log: [{ emit: 'event', level: 'query' }],
  });
  // O tipo de `$on` só aparece com o genérico de `log`, que conflita com `datasourceUrl`.
  (prisma as unknown as { $on(event: 'query', cb: () => void): void }).$on('query', () => {
    queryCount += 1;
  });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      timezone: 'America/Campo_Grande',
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  const channel = await prisma.notificationChannel.create({
    data: { userId: user.id, type: 'EMAIL', destination: user.email, status: 'ACTIVE' },
  });
  return { user, channel };
}

async function createWatch(
  userId: string,
  notificationChannelId: string,
  opts: { createdAt: Date; searchTargetId?: string },
) {
  const searchTargetId =
    opts.searchTargetId ??
    (
      await prisma.searchTarget.create({
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
        },
      })
    ).id;
  return prisma.watch.create({
    data: {
      userId,
      searchTargetId,
      notificationChannelId,
      startsAt: new Date('2026-01-01'),
      createdAt: opts.createdAt,
      alertRules: {
        create: { type: 'TARGET_PRICE', targetAmountMinor: 50_000, cooldownSeconds: 3600 },
      },
    },
  });
}

async function seedObservation(
  searchTargetId: string,
  totalAmountMinor: number,
  observedAt: Date,
  status: 'SUCCEEDED' | 'NO_OFFERS' = 'SUCCEEDED',
) {
  const execution = await prisma.searchExecution.create({
    data: {
      searchTargetId,
      providerStrategy: 'SIMULATED',
      status,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      completedAt: observedAt,
      createdAt: observedAt,
    },
  });
  if (status === 'NO_OFFERS') return;
  await prisma.priceObservation.create({
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

describe('listWatchesForUser (Postgres real via Testcontainers)', () => {
  it('projeta último preço, menor preço e última execução de cada Watch', async () => {
    const { user, channel } = await createUser();
    const withPrices = await createWatch(user.id, channel.id, {
      createdAt: new Date('2026-06-02'),
    });
    const withoutPrices = await createWatch(user.id, channel.id, {
      createdAt: new Date('2026-06-01'),
    });
    await seedObservation(withPrices.searchTargetId, 90_000, new Date('2026-07-01'));
    await seedObservation(withPrices.searchTargetId, 70_000, new Date('2026-07-02'));
    await seedObservation(withPrices.searchTargetId, 80_000, new Date('2026-07-03'));
    await seedObservation(withPrices.searchTargetId, 0, new Date('2026-07-04'), 'NO_OFFERS');

    const page = await listWatchesForUser(prisma, user.id);

    expect(page.items.map((i) => i.watch.id)).toEqual([withPrices.id, withoutPrices.id]);
    const [first, second] = page.items;
    expect(first?.latestObservation?.totalAmountMinor).toBe(80_000);
    expect(first?.lowestObservation?.totalAmountMinor).toBe(70_000);
    expect(first?.latestExecution?.status).toBe('NO_OFFERS');
    expect(first?.alertRules).toHaveLength(1);
    expect(second?.latestObservation).toBeNull();
    expect(second?.lowestObservation).toBeNull();
    expect(second?.latestExecution).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it('pagina por cursor sem repetir nem perder Watches, só do dono', async () => {
    const { user, channel } = await createUser();
    const other = await createUser();
    await createWatch(other.user.id, other.channel.id, { createdAt: new Date('2026-06-10') });
    const created = [];
    for (let day = 1; day <= 5; day += 1) {
      created.push(
        await createWatch(user.id, channel.id, { createdAt: new Date(`2026-06-0${day}`) }),
      );
    }
    const expected = created.map((w) => w.id).reverse();

    const first = await listWatchesForUser(prisma, user.id, { limit: 2 });
    expect(first.items.map((i) => i.watch.id)).toEqual(expected.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();

    const second = await listWatchesForUser(prisma, user.id, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((i) => i.watch.id)).toEqual(expected.slice(2, 4));

    const third = await listWatchesForUser(prisma, user.id, {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(third.items.map((i) => i.watch.id)).toEqual(expected.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it('usa um número de consultas constante, independente da quantidade de Watches (H09)', async () => {
    const { user, channel } = await createUser();
    for (let i = 0; i < 30; i += 1) {
      const watch = await createWatch(user.id, channel.id, {
        createdAt: new Date(Date.UTC(2026, 5, 1, 0, i)),
      });
      await seedObservation(watch.searchTargetId, 60_000 + i, new Date('2026-07-01'));
    }

    queryCount = 0;
    const page = await listWatchesForUser(prisma, user.id, { limit: 30 });

    expect(page.items).toHaveLength(30);
    expect(queryCount).toBeLessThanOrEqual(6);
  });
});
