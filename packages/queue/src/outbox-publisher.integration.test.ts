import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';
import { createRedisConnection } from './connection.js';
import { publishPendingOutboxEvents } from './outbox-publisher.js';
import {
  type PriceCheckRequestedJob,
  createPriceCheckOutboxHandler,
  createPriceCheckQueue,
} from './queues.js';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let prisma: PrismaClient;
let connection: Redis;
let queue: Queue<PriceCheckRequestedJob>;

beforeAll(async () => {
  [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const databasePackageDir = path.resolve(process.cwd(), '../database');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: databasePackageDir,
    env: { ...process.env, DATABASE_URL: pgContainer.getConnectionUri() },
    stdio: 'pipe',
  });

  prisma = createPrismaClient(pgContainer.getConnectionUri());
  connection = createRedisConnection(redisContainer.getConnectionUrl());
  queue = createPriceCheckQueue(connection);
}, 120_000);

afterAll(async () => {
  await queue?.close();
  await connection?.quit();
  await prisma?.$disconnect();
  await pgContainer?.stop();
  await redisContainer?.stop();
});

function samplePriceCheckJob(
  overrides: Partial<PriceCheckRequestedJob> = {},
): PriceCheckRequestedJob {
  return {
    schemaVersion: 1,
    jobId: randomUUID(),
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
    searchTargetId: randomUUID(),
    scheduleWindow: `${new Date().toISOString()}/${new Date().toISOString()}`,
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('publishPendingOutboxEvents', () => {
  it('enqueues a registered event type and marks it published', async () => {
    const job = samplePriceCheckJob();
    const event = await prisma.outboxEvent.create({
      data: { eventType: 'PriceCheckRequested.v1', payload: { ...job } },
    });

    const result = await publishPendingOutboxEvents(prisma, {
      'PriceCheckRequested.v1': createPriceCheckOutboxHandler(queue),
    });

    expect(result.published).toBeGreaterThanOrEqual(1);

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe('PUBLISHED');
    expect(updated.publishedAt).not.toBeNull();

    const queuedJob = await queue.getJob(job.idempotencyKey);
    expect(queuedJob).toBeDefined();
    expect(queuedJob?.data.searchTargetId).toBe(job.searchTargetId);
  });

  // ADR-003: eventType sem consumidor registrado fica PENDING, não é descartado
  // nem publicado "no vazio".
  it('leaves an event type without a registered handler as pending', async () => {
    const event = await prisma.outboxEvent.create({
      data: { eventType: 'WatchCreated.v1', payload: { watchId: randomUUID() } },
    });

    await publishPendingOutboxEvents(prisma, {
      'PriceCheckRequested.v1': createPriceCheckOutboxHandler(queue),
    });

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe('PENDING');
  });

  it('does nothing when no handlers are registered', async () => {
    const result = await publishPendingOutboxEvents(prisma, {});
    expect(result).toEqual({ published: 0, failed: 0 });
  });
});
