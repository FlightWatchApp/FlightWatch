import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Job } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';
import {
  CircuitBreaker,
  TokenBucketRateLimiter,
  SimulatedFlightProvider,
  failingScenario,
  noOffersScenario,
  offersScenario,
  sequenceScenario,
  type FlightProvider,
} from '@flight-watch/providers';
import type { FlightOffer } from '@flight-watch/domain';
import type { PriceCheckRequestedJob } from '@flight-watch/queue';
import { createPriceWorkerMetrics } from './metrics.js';
import { type ProcessJobDeps, processPriceCheckJob } from './process-job.js';

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

async function seedScheduledExecution() {
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
  const idempotencyKey = randomUUID();
  const execution = await prisma.searchExecution.create({
    data: {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      status: 'SCHEDULED',
      idempotencyKey,
      correlationId: randomUUID(),
    },
  });
  return { target, execution, idempotencyKey };
}

function fakeJob(idempotencyKey: string, searchTargetId: string): Job<PriceCheckRequestedJob> {
  return {
    data: {
      schemaVersion: 1,
      jobId: randomUUID(),
      idempotencyKey,
      correlationId: randomUUID(),
      searchTargetId,
      scheduleWindow: `${new Date().toISOString()}/${new Date().toISOString()}`,
      requestedAt: new Date().toISOString(),
    },
  } as Job<PriceCheckRequestedJob>;
}

function baseDeps(provider: ProcessJobDeps['provider']): ProcessJobDeps {
  return {
    prisma,
    provider,
    rateLimiter: new TokenBucketRateLimiter(10, 10),
    circuitBreaker: new CircuitBreaker(5, 30_000),
    metrics: createPriceWorkerMetrics(),
  };
}

function sampleOffer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    providerOfferId: 'offer-1',
    totalAmountMinor: 97_000,
    currency: 'BRL',
    passengerCount: 1,
    segments: [
      {
        originIata: 'DOU',
        destinationIata: 'GRU',
        departureAt: '2027-01-01T08:00:00Z',
        arrivalAt: '2027-01-01T10:00:00Z',
        carrier: 'SIM',
      },
    ],
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('processPriceCheckJob', () => {
  it('persists a PriceObservation and marks the execution succeeded', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(offersScenario([sampleOffer()]));

    await processPriceCheckJob(baseDeps(provider), fakeJob(idempotencyKey, target.id));

    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('SUCCEEDED');

    const observation = await prisma.priceObservation.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(observation?.totalAmountMinor).toBe(97_000);

    const updatedTarget = await prisma.searchTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(updatedTarget.lastCheckedAt).not.toBeNull();
    expect(updatedTarget.nextCheckAt?.getTime()).toBeGreaterThan(Date.now());
  });

  // ADR-007 / SPEC-003 §11 / SPEC-004 §12: prova que as métricas reagem a uma
  // execução real, não só que os contadores existem.
  it('records provider_call_total, offers metrics, and price_observation_total on success', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(offersScenario([sampleOffer()]));
    const metrics = createPriceWorkerMetrics();

    await processPriceCheckJob(
      {
        prisma,
        provider,
        rateLimiter: new TokenBucketRateLimiter(10, 10),
        circuitBreaker: new CircuitBreaker(5, 30_000),
        metrics,
      },
      fakeJob(idempotencyKey, target.id),
    );

    const body = await metrics.registry.metrics();
    expect(body).toContain('provider_call_total{provider="SIMULATED",result="success"} 1');
    expect(body).toContain('offers_received_total 1');
    expect(body).toContain('offers_eligible_total 1');
    expect(body).toContain('price_observation_total{result="success"} 1');
  });

  // EVAL-PRICE-003: resposta válida sem ofertas -> no_offers, sem observação nova.
  it('marks no_offers without creating a PriceObservation', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(noOffersScenario());

    await processPriceCheckJob(baseDeps(provider), fakeJob(idempotencyKey, target.id));

    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('NO_OFFERS');

    const observationCount = await prisma.priceObservation.count({
      where: { searchTargetId: target.id },
    });
    expect(observationCount).toBe(0);
  });

  // EVAL-PROVIDER-003: falha de autenticação não é retentável.
  it('marks a non-retryable provider error as permanent and does not throw', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(
      failingScenario('AUTHENTICATION', 'invalid credentials'),
    );

    await expect(
      processPriceCheckJob(baseDeps(provider), fakeJob(idempotencyKey, target.id)),
    ).resolves.toBeUndefined();

    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('PERMANENT_FAILURE');
    expect(execution?.errorCode).toBe('AUTHENTICATION');
  });

  // EVAL-PROVIDER-002: timeout é retentável — o worker relança para o BullMQ reagendar.
  it('marks a retryable provider error and throws so BullMQ retries', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(failingScenario('TIMEOUT', 'simulated timeout'));

    await expect(
      processPriceCheckJob(baseDeps(provider), fakeJob(idempotencyKey, target.id)),
    ).rejects.toThrow();

    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('RETRYABLE_FAILURE');
    expect(execution?.errorCode).toBe('TIMEOUT');
  });

  // AC-009 (SPEC-003): redelivery de um job já processado não reprocessa.
  it('does nothing when the execution is no longer SCHEDULED (already processed)', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(offersScenario([sampleOffer()]));
    const metrics = createPriceWorkerMetrics();
    const deps = { ...baseDeps(provider), metrics };

    await processPriceCheckJob(deps, fakeJob(idempotencyKey, target.id));
    const firstObservationCount = await prisma.priceObservation.count({
      where: { searchTargetId: target.id },
    });

    await processPriceCheckJob(deps, fakeJob(idempotencyKey, target.id));
    const secondObservationCount = await prisma.priceObservation.count({
      where: { searchTargetId: target.id },
    });

    expect(secondObservationCount).toBe(firstObservationCount);
    expect(await metrics.registry.metrics()).toContain(
      'price_observation_total{result="idempotent_replay"} 1',
    );
  });

  it('does nothing when no execution matches the idempotencyKey', async () => {
    const provider = new SimulatedFlightProvider(offersScenario([sampleOffer()]));
    await expect(
      processPriceCheckJob(baseDeps(provider), fakeJob(randomUUID(), randomUUID())),
    ).resolves.toBeUndefined();
  });

  it('marks RATE_LIMITED and throws when the local rate limiter has no capacity', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(offersScenario([sampleOffer()]));
    const deps: ProcessJobDeps = {
      ...baseDeps(provider),
      rateLimiter: new TokenBucketRateLimiter(0, 0),
    };

    await expect(processPriceCheckJob(deps, fakeJob(idempotencyKey, target.id))).rejects.toThrow();

    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('RATE_LIMITED');
  });

  // Regressão: um RETRYABLE_FAILURE travava a execução para sempre — o guard só
  // aceitava reprocessar a partir de SCHEDULED, então a redelivery do BullMQ
  // batia num "return" silencioso em vez de tentar de novo.
  it('actually retries on the next delivery after a retryable failure, and increments attempt', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    const provider = new SimulatedFlightProvider(
      sequenceScenario([
        failingScenario('TIMEOUT', 'first attempt times out'),
        offersScenario([sampleOffer()]),
      ]),
    );
    const deps = baseDeps(provider);
    const job = fakeJob(idempotencyKey, target.id);

    await expect(processPriceCheckJob(deps, job)).rejects.toThrow();
    const afterFirstAttempt = await prisma.searchExecution.findFirstOrThrow({
      where: { searchTargetId: target.id },
    });
    expect(afterFirstAttempt.status).toBe('RETRYABLE_FAILURE');
    expect(afterFirstAttempt.attempt).toBe(1);

    // BullMQ redelivera o mesmo job — antes do fix isto não fazia nada.
    await processPriceCheckJob(deps, job);
    const afterRetry = await prisma.searchExecution.findFirstOrThrow({
      where: { searchTargetId: target.id },
    });
    expect(afterRetry.status).toBe('SUCCEEDED');
    expect(afterRetry.attempt).toBe(2);

    const observation = await prisma.priceObservation.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(observation?.totalAmountMinor).toBe(97_000);
  });

  // Regressão: claim era find+update separados — duas entregas concorrentes do
  // mesmo job podiam ambas ler SCHEDULED e ambas seguir em frente.
  it('lets only one of two concurrent deliveries actually claim and process the execution', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    let searchCalls = 0;
    const countingProvider: FlightProvider = {
      strategy: 'SIMULATED',
      async search() {
        searchCalls += 1;
        return { kind: 'offers', offers: [sampleOffer()] };
      },
    };
    const deps = baseDeps(countingProvider);
    const job = fakeJob(idempotencyKey, target.id);

    await Promise.all([processPriceCheckJob(deps, job), processPriceCheckJob(deps, job)]);

    expect(searchCalls).toBe(1);
    const observationCount = await prisma.priceObservation.count({
      where: { searchTargetId: target.id },
    });
    expect(observationCount).toBe(1);
  });

  // SPEC-003 §2/§5: target cancelado (ou sem Watch ativo) entre o agendamento e o
  // processamento não deve gastar uma chamada de provedor.
  it('does not call the provider and marks permanent failure when the target is no longer eligible', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();
    await prisma.watch.updateMany({
      where: { searchTargetId: target.id },
      data: { status: 'CANCELLED' },
    });

    let searchCalls = 0;
    const countingProvider: FlightProvider = {
      strategy: 'SIMULATED',
      async search() {
        searchCalls += 1;
        return { kind: 'offers', offers: [sampleOffer()] };
      },
    };

    await processPriceCheckJob(baseDeps(countingProvider), fakeJob(idempotencyKey, target.id));

    expect(searchCalls).toBe(0);
    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('PERMANENT_FAILURE');
    expect(execution?.errorCode).toBe('TARGET_NO_LONGER_ELIGIBLE');
  });

  // SPEC-011 AC-002: a execução é reconciliada como abandonada ENQUANTO a
  // chamada ao provedor ainda está em voo — o provider simulado aqui imita
  // exatamente isso, revogando o lease (mesmo efeito de
  // reconcileAbandonedSearchExecutions) como efeito colateral do próprio
  // `search()`, antes de devolver um resultado válido.
  it('discards the result and does not crash when the execution is reconciled while the provider call is in flight', async () => {
    const { target, idempotencyKey } = await seedScheduledExecution();

    const reconcilingProvider: FlightProvider = {
      strategy: 'SIMULATED',
      async search(_query, context) {
        await prisma.searchExecution.updateMany({
          where: { id: context.searchExecutionId },
          data: { status: 'RETRYABLE_FAILURE', errorCode: 'ABANDONED_LEASE', leaseToken: null },
        });
        return { kind: 'offers', offers: [sampleOffer()] };
      },
    };

    const metrics = createPriceWorkerMetrics();
    await expect(
      processPriceCheckJob(
        { ...baseDeps(reconcilingProvider), metrics },
        fakeJob(idempotencyKey, target.id),
      ),
    ).resolves.toBeUndefined();

    // O resultado tardio não foi persistido — a execução continua no estado
    // que a "reconciliação" deixou, não em SUCCEEDED.
    const execution = await prisma.searchExecution.findFirst({
      where: { searchTargetId: target.id },
    });
    expect(execution?.status).toBe('RETRYABLE_FAILURE');
    expect(execution?.errorCode).toBe('ABANDONED_LEASE');
    const observationCount = await prisma.priceObservation.count({
      where: { searchTargetId: target.id },
    });
    expect(observationCount).toBe(0);

    const body = await metrics.registry.metrics();
    expect(body).toContain(
      'search_execution_stale_lease_rejections_total{action="persist_success"} 1',
    );
  });
});
