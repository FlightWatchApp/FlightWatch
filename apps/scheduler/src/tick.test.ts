import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';
import { runSchedulerTick } from './tick.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databasePackageDir = path.resolve(process.cwd(), '../../packages/database');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: databasePackageDir,
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });
  prisma = createPrismaClient(container.getConnectionUri());
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

async function seedEligibleTarget() {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      status: 'ACTIVE',
      timezone: 'America/Sao_Paulo',
      passwordHash: 'not-a-real-hash-this-test-never-logs-in',
    },
  });
  const channel = await prisma.notificationChannel.create({
    data: {
      userId: user.id,
      type: 'EMAIL',
      destination: user.email,
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
  });
  const target = await prisma.searchTarget.create({
    data: {
      fingerprint: randomUUID(),
      canonicalKey: 'test-key',
      originIata: 'DOU',
      destinationIata: 'GRU',
      departureDate: new Date('2027-01-01'),
      tripType: 'ONE_WAY',
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      nextCheckAt: new Date(Date.now() - 60_000),
      checkIntervalSeconds: 14_400,
      providerStrategy: 'SIMULATED',
    },
  });
  await prisma.watch.create({
    data: {
      userId: user.id,
      searchTargetId: target.id,
      notificationChannelId: channel.id,
      status: 'ACTIVE',
    },
  });
  return target;
}

describe('runSchedulerTick', () => {
  it('schedules an execution and writes a PriceCheckRequested.v1 outbox event', async () => {
    const target = await seedEligibleTarget();

    const result = await runSchedulerTick(prisma);
    expect(result.scheduled).toBeGreaterThanOrEqual(1);

    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('SCHEDULED');

    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: { eventType: 'PriceCheckRequested.v1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outboxEvent).not.toBeNull();
    const payload = outboxEvent?.payload as { searchTargetId?: string } | null;
    expect(payload?.searchTargetId).toBe(target.id);
  });

  // AC-001/AC-002: um target com execução em aberto não é reagendado de novo.
  it('does not reschedule a target that already has an execution in flight', async () => {
    const target = await seedEligibleTarget();

    await runSchedulerTick(prisma);
    const executionsAfterFirstTick = await prisma.searchExecution.count({
      where: { searchTargetId: target.id },
    });

    const secondTick = await runSchedulerTick(prisma);
    const executionsAfterSecondTick = await prisma.searchExecution.count({
      where: { searchTargetId: target.id },
    });

    expect(executionsAfterSecondTick).toBe(executionsAfterFirstTick);
    expect(secondTick.scheduled).toBe(0);
  });

  it('reconciles a stale execution and reports it', async () => {
    const target = await seedEligibleTarget();
    const staleExecution = await prisma.searchExecution.create({
      data: {
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        status: 'RUNNING',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      },
    });
    await prisma.searchExecution.update({
      where: { id: staleExecution.id },
      data: { createdAt: new Date(Date.now() - 3_600_000) },
    });

    const result = await runSchedulerTick(prisma, { abandonedLeaseTimeoutMs: 60_000 });
    expect(result.reconciled).toBeGreaterThanOrEqual(1);

    const updated = await prisma.searchExecution.findUniqueOrThrow({
      where: { id: staleExecution.id },
    });
    expect(updated.status).toBe('RETRYABLE_FAILURE');
  });

  // Regressão: excluir só SCHEDULED/RUNNING da elegibilidade deixava o
  // scheduler recriar uma execução nova pro mesmo target enquanto o BullMQ
  // ainda tinha seu próprio retry pendente daquele job (nextCheckAt nunca
  // avança em falha) — duas execuções concorrentes pro mesmo preço.
  it('does not reschedule a target whose only execution is RETRYABLE_FAILURE or RATE_LIMITED', async () => {
    const target = await seedEligibleTarget();
    await prisma.searchExecution.create({
      data: {
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        status: 'RETRYABLE_FAILURE',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        completedAt: new Date(),
      },
    });

    const result = await runSchedulerTick(prisma);

    expect(result.scheduled).toBe(0);
    const executionCount = await prisma.searchExecution.count({
      where: { searchTargetId: target.id },
    });
    expect(executionCount).toBe(1);
  });

  it('reconciles an execution whose retries are exhausted to PERMANENT_FAILURE, freeing the target', async () => {
    const target = await seedEligibleTarget();
    const staleFailure = await prisma.searchExecution.create({
      data: {
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        status: 'RETRYABLE_FAILURE',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        completedAt: new Date(Date.now() - 3_600_000),
      },
    });

    const result = await runSchedulerTick(prisma, { retryExhaustionTimeoutMs: 60_000 });
    expect(result.retriesExhausted).toBeGreaterThanOrEqual(1);

    const updated = await prisma.searchExecution.findUniqueOrThrow({
      where: { id: staleFailure.id },
    });
    expect(updated.status).toBe('PERMANENT_FAILURE');
    // Target livre pra um novo agendamento na MESMA tick (a reconciliação e a
    // seleção de elegíveis rodam na mesma transação).
    expect(result.scheduled).toBeGreaterThanOrEqual(1);
  });

  // DOMAIN.md §3.2: expiresAt é setado na criação do Watch (watches.service.ts)
  // mas nada aplicava — o status nunca saía de ACTIVE.
  it('expires a watch past its expiresAt and stops scheduling its target', async () => {
    const target = await seedEligibleTarget();
    const watch = await prisma.watch.findFirstOrThrow({ where: { searchTargetId: target.id } });
    await prisma.watch.update({
      where: { id: watch.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await runSchedulerTick(prisma);
    expect(result.watchesExpired).toBeGreaterThanOrEqual(1);

    const updatedWatch = await prisma.watch.findUniqueOrThrow({ where: { id: watch.id } });
    expect(updatedWatch.status).toBe('EXPIRED');
    // Sem Watch ativo, o target não é mais elegível (mesma regra de sempre).
    expect(result.scheduled).toBe(0);
  });
});
