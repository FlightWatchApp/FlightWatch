import { execSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type PrismaClient, createPrismaClient, findAirlineNames } from '@flight-watch/database';
import { ProviderError } from '@flight-watch/providers';
import { runAirlinesSync } from './airlines-sync.js';
import { createSchedulerMetrics } from './metrics.js';

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

describe('runAirlinesSync (SPEC-038)', () => {
  const now = new Date('2026-10-14T12:00:00Z');

  it('falha da fonte não lança e não grava nada; depois grava e, fresco, não baixa de novo', async () => {
    const metrics = createSchedulerMetrics();
    const failing = vi.fn(async () => {
      throw new ProviderError('UNAVAILABLE', 'airlines source: returned 503');
    });
    expect(await runAirlinesSync({ prisma, fetchAirlines: failing, metrics, now: () => now })).toBe(
      'failed',
    );

    const fetchAirlines = vi.fn(async () => ({
      airlines: [{ code: 'AD', name: 'Azul Airlines' }],
      invalid: 2,
    }));
    expect(await runAirlinesSync({ prisma, fetchAirlines, metrics, now: () => now })).toBe(
      'success',
    );
    expect(Object.fromEntries(await findAirlineNames(prisma, ['AD']))).toEqual({
      AD: 'Azul Airlines',
    });

    expect(await runAirlinesSync({ prisma, fetchAirlines, metrics, now: () => now })).toBe(
      'skipped_fresh',
    );
    expect(fetchAirlines).toHaveBeenCalledTimes(1);
  });
});
