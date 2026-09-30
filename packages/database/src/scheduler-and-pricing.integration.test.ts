import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from './client.js';
import { StaleLeaseError } from './concurrency.js';
import {
  claimSearchExecutionForRunning,
  markSearchExecutionFailed,
  persistNoOffersResult,
  persistPriceObservationSuccess,
} from './price-observation-repository.js';
import {
  countDelayedSearchTargetsByPriority,
  createScheduledSearchExecution,
  reconcileAbandonedSearchExecutions,
  reconcileExhaustedRetries,
  selectEligibleSearchTargetsForUpdate,
} from './scheduler-repository.js';

/** SPEC-011: as escritas terminais agora exigem o lease emitido pelo claim. */
async function claimForTest(prisma: PrismaClient, searchExecutionId: string): Promise<string> {
  const claimed = await prisma.$transaction((tx) =>
    claimSearchExecutionForRunning(tx, searchExecutionId),
  );
  if (!claimed?.leaseToken) {
    throw new Error('test setup: claim failed to produce a lease token');
  }
  return claimed.leaseToken;
}

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

async function seedTarget(
  overrides: {
    nextCheckAt?: Date | null;
    departureDate?: Date;
    withActiveWatch?: boolean;
  } = {},
) {
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
      departureDate: overrides.departureDate ?? new Date('2027-01-01'),
      tripType: 'ONE_WAY',
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      nextCheckAt:
        overrides.nextCheckAt === undefined ? new Date(Date.now() - 60_000) : overrides.nextCheckAt,
      checkIntervalSeconds: 14_400,
    },
  });
  if (overrides.withActiveWatch !== false) {
    await prisma.watch.create({
      data: {
        userId: user.id,
        searchTargetId: target.id,
        notificationChannelId: channel.id,
        status: 'ACTIVE',
      },
    });
  }
  return { user, channel, target };
}

describe('selectEligibleSearchTargetsForUpdate', () => {
  it('selects a target that is due, active, and has an active watch', async () => {
    const { target } = await seedTarget();
    const eligible = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 10),
    );
    expect(eligible.some((row) => row.id === target.id)).toBe(true);
  });

  it('excludes a target whose nextCheckAt is in the future', async () => {
    const { target } = await seedTarget({ nextCheckAt: new Date(Date.now() + 3_600_000) });
    const eligible = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 50),
    );
    expect(eligible.some((row) => row.id === target.id)).toBe(false);
  });

  it('excludes a target with no active watch', async () => {
    const { target } = await seedTarget({ withActiveWatch: false });
    const eligible = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 50),
    );
    expect(eligible.some((row) => row.id === target.id)).toBe(false);
  });

  it('excludes a target whose departure date has already passed', async () => {
    const { target } = await seedTarget({ departureDate: new Date('2020-01-01') });
    const eligible = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 50),
    );
    expect(eligible.some((row) => row.id === target.id)).toBe(false);
  });

  it('excludes a target that already has a SCHEDULED execution in flight', async () => {
    const { target } = await seedTarget();
    await prisma.searchExecution.create({
      data: {
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        status: 'SCHEDULED',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      },
    });
    const eligible = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 50),
    );
    expect(eligible.some((row) => row.id === target.id)).toBe(false);
  });

  // AC-002: duas réplicas do scheduler não pegam o mesmo target ao mesmo tempo.
  it('lets only one of two concurrent transactions lock the same eligible target', async () => {
    const { target } = await seedTarget();

    const results = await Promise.all([
      prisma.$transaction(async (tx) => {
        const rows = await selectEligibleSearchTargetsForUpdate(tx, 1);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return rows;
      }),
      prisma.$transaction(async (tx) => {
        const rows = await selectEligibleSearchTargetsForUpdate(tx, 1);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return rows;
      }),
    ]);

    const totalLocked = results.flat().filter((row) => row.id === target.id).length;
    expect(totalLocked).toBe(1);
  });
});

describe('countDelayedSearchTargetsByPriority', () => {
  // SPEC-002 §11: gauge de targets atrasados por classe.
  it('counts an eligible target under its priority class', async () => {
    const { target } = await seedTarget();

    const rows = await countDelayedSearchTargetsByPriority(prisma);

    const row = rows.find((r) => r.priority === target.priority);
    expect(row).toBeDefined();
    expect(Number(row?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('does not count a target that is not yet due', async () => {
    const { target } = await seedTarget({ nextCheckAt: new Date(Date.now() + 3_600_000) });

    const rows = await countDelayedSearchTargetsByPriority(prisma);

    // Não há garantia de que o total seja zero (outros testes compartilham o
    // container) — a prova é que este target específico não elevou a
    // contagem além do que já existia antes dele.
    const before = rows.find((r) => r.priority === target.priority)?.count ?? 0n;
    const another = await seedTarget({ nextCheckAt: new Date(Date.now() - 60_000) });
    const after = await countDelayedSearchTargetsByPriority(prisma);
    const afterCount = after.find((r) => r.priority === another.target.priority)?.count ?? 0n;
    expect(Number(afterCount)).toBe(Number(before) + 1);
  });
});

describe('reconcileAbandonedSearchExecutions', () => {
  // Regressão: este teste antes esperava o target elegível de novo logo após
  // a reconciliação pra RETRYABLE_FAILURE — exatamente o bug que causava
  // execuções duplicadas (o scheduler recriava uma execução nova enquanto o
  // BullMQ ainda tinha seu próprio retry pendente daquele job). RETRYABLE_FAILURE
  // agora bloqueia re-agendamento até um status terminal de verdade.
  it('resets a stale SCHEDULED execution to RETRYABLE_FAILURE without making the target eligible again', async () => {
    const { target } = await seedTarget();
    const execution = await prisma.searchExecution.create({
      data: {
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        status: 'SCHEDULED',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      },
    });
    await prisma.searchExecution.update({
      where: { id: execution.id },
      data: { createdAt: new Date(Date.now() - 3_600_000) },
    });

    const reconciled = await prisma.$transaction((tx) =>
      reconcileAbandonedSearchExecutions(tx, 60_000),
    );
    expect(reconciled).toBeGreaterThanOrEqual(1);

    const updated = await prisma.searchExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.status).toBe('RETRYABLE_FAILURE');

    const eligibleRightAfter = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 50),
    );
    expect(eligibleRightAfter.some((row) => row.id === target.id)).toBe(false);

    // Só depois que a retentativa também é dada como esgotada (PERMANENT_FAILURE)
    // o target volta a ficar elegível pra um agendamento novo — precisa que
    // completedAt (setado pela reconciliação acima) já esteja velho o
    // suficiente pra reconcileExhaustedRetries considerar esgotada.
    await prisma.searchExecution.update({
      where: { id: execution.id },
      data: { completedAt: new Date(Date.now() - 3_600_000) },
    });
    await prisma.$transaction((tx) => reconcileExhaustedRetries(tx, 60_000));
    const eligibleAfterExhaustion = await prisma.$transaction((tx) =>
      selectEligibleSearchTargetsForUpdate(tx, 50),
    );
    expect(eligibleAfterExhaustion.some((row) => row.id === target.id)).toBe(true);
  });
});

describe('persistPriceObservationSuccess', () => {
  it('inserts an observation, marks the execution succeeded, and advances the schedule', async () => {
    const { target } = await seedTarget();
    const execution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });

    const leaseToken = await claimForTest(prisma, execution.id);
    const nextCheckAt = new Date(Date.now() + 14_400_000);
    const { observation, created } = await prisma.$transaction((tx) =>
      persistPriceObservationSuccess(tx, {
        searchExecutionId: execution.id,
        leaseToken,
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        correlationId: randomUUID(),
        observedAt: new Date(),
        totalAmountMinor: 97_000,
        currency: 'BRL',
        itinerary: [{ originIata: 'DOU', destinationIata: 'GRU' }],
        offerSignature: 'sig-1',
        deeplink: null,
        expiresAt: null,
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
        offersReceivedCount: 3,
        nextCheckAt,
      }),
    );

    expect(created).toBe(true);
    expect(observation.totalAmountMinor).toBe(97_000);

    const updatedExecution = await prisma.searchExecution.findUniqueOrThrow({
      where: { id: execution.id },
    });
    expect(updatedExecution.status).toBe('SUCCEEDED');
    expect(updatedExecution.offersCount).toBe(3);

    const updatedTarget = await prisma.searchTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(updatedTarget.nextCheckAt?.toISOString()).toBe(nextCheckAt.toISOString());

    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: { eventType: 'PriceObserved.v1' },
    });
    expect(outboxEvent).not.toBeNull();
  });

  // AC-005 (SPEC-004): reprocessamento com a mesma observationKey não duplica.
  it('is idempotent for the same observationKey', async () => {
    const { target } = await seedTarget();
    const execution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const leaseToken = await claimForTest(prisma, execution.id);
    const observationKey = randomUUID();
    const insertInput = {
      searchExecutionId: execution.id,
      leaseToken,
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      correlationId: randomUUID(),
      observedAt: new Date(),
      totalAmountMinor: 97_000,
      currency: 'BRL',
      itinerary: [],
      offerSignature: 'sig-1',
      deeplink: null,
      expiresAt: null,
      qualityFlags: [],
      observationKey,
      selectionPolicyVersion: 1,
      normalizerVersion: 1,
      offersReceivedCount: 1,
      nextCheckAt: new Date(Date.now() + 3_600_000),
    };

    const first = await prisma.$transaction((tx) =>
      persistPriceObservationSuccess(tx, insertInput),
    );
    const second = await prisma.$transaction((tx) =>
      persistPriceObservationSuccess(tx, insertInput),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.observation.id).toBe(first.observation.id);
    const count = await prisma.priceObservation.count({ where: { observationKey } });
    expect(count).toBe(1);
  });
});

describe('persistNoOffersResult', () => {
  it('marks no_offers without creating an observation or erasing the last valid one', async () => {
    const { target } = await seedTarget();

    const firstExecution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const firstLeaseToken = await claimForTest(prisma, firstExecution.id);
    await prisma.$transaction((tx) =>
      persistPriceObservationSuccess(tx, {
        searchExecutionId: firstExecution.id,
        leaseToken: firstLeaseToken,
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        correlationId: randomUUID(),
        observedAt: new Date(),
        totalAmountMinor: 97_000,
        currency: 'BRL',
        itinerary: [],
        offerSignature: 'sig-1',
        deeplink: null,
        expiresAt: null,
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
        offersReceivedCount: 1,
        nextCheckAt: new Date(Date.now() + 3_600_000),
      }),
    );

    const secondExecution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const secondLeaseToken = await claimForTest(prisma, secondExecution.id);
    await prisma.$transaction((tx) =>
      persistNoOffersResult(tx, {
        searchExecutionId: secondExecution.id,
        leaseToken: secondLeaseToken,
        searchTargetId: target.id,
        completedAt: new Date(),
        nextCheckAt: new Date(Date.now() + 3_600_000),
        offersReceivedCount: 0,
      }),
    );

    const updatedExecution = await prisma.searchExecution.findUniqueOrThrow({
      where: { id: secondExecution.id },
    });
    expect(updatedExecution.status).toBe('NO_OFFERS');

    const observationCount = await prisma.priceObservation.count({
      where: { searchTargetId: target.id },
    });
    expect(observationCount).toBe(1);
  });
});

// SPEC-011: fencing de SearchExecution.
describe('SearchExecution lease fencing', () => {
  // AC-001
  it('accepts terminal writes when the lease is still valid (normal flow unaffected)', async () => {
    const { target } = await seedTarget();
    const execution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const leaseToken = await claimForTest(prisma, execution.id);

    await expect(
      prisma.$transaction((tx) =>
        markSearchExecutionFailed(tx, {
          searchExecutionId: execution.id,
          leaseToken,
          status: 'PERMANENT_FAILURE',
          errorCode: 'TEST_REASON',
        }),
      ),
    ).resolves.toBeUndefined();

    const updated = await prisma.searchExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.status).toBe('PERMANENT_FAILURE');
  });

  // AC-002 / AC-004: a corrida real — claim, reconciliar (zera o lease), e só
  // depois o worker "original" tenta escrever com o lease antigo.
  it('rejects a terminal write whose execution was reconciled as abandoned in the meantime', async () => {
    const { target } = await seedTarget();
    const execution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const staleLeaseToken = await claimForTest(prisma, execution.id);

    // Simula o scheduler reconciliando a execução como abandonada — mesmo
    // efeito de reconcileAbandonedSearchExecutions: RETRYABLE_FAILURE + lease zerado.
    const reconciledCount = await prisma.$transaction((tx) =>
      reconcileAbandonedSearchExecutions(tx, -1),
    );
    expect(reconciledCount).toBeGreaterThanOrEqual(1);

    // O worker "original", que não sabe que foi reconciliado, tenta escrever
    // com o lease que já não é mais válido.
    await expect(
      prisma.$transaction((tx) =>
        markSearchExecutionFailed(tx, {
          searchExecutionId: execution.id,
          leaseToken: staleLeaseToken,
          status: 'RETRYABLE_FAILURE',
          errorCode: 'SIMULATED_LATE_PROVIDER_ERROR',
        }),
      ),
    ).rejects.toBeInstanceOf(StaleLeaseError);

    // O estado da reconciliação não foi sobrescrito pela escrita tardia.
    const updated = await prisma.searchExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.errorCode).toBe('ABANDONED_LEASE');
  });

  // AC-004: persistPriceObservationSuccess rejeitada por lease não cria
  // PriceObservation nem outbox — tudo ou nada.
  it('rejects a stale persistPriceObservationSuccess without creating an observation or outbox event', async () => {
    const { target } = await seedTarget();
    const execution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const staleLeaseToken = await claimForTest(prisma, execution.id);
    await prisma.$transaction((tx) => reconcileAbandonedSearchExecutions(tx, -1));

    const observationKey = randomUUID();
    await expect(
      prisma.$transaction((tx) =>
        persistPriceObservationSuccess(tx, {
          searchExecutionId: execution.id,
          leaseToken: staleLeaseToken,
          searchTargetId: target.id,
          providerStrategy: 'SIMULATED',
          correlationId: randomUUID(),
          observedAt: new Date(),
          totalAmountMinor: 97_000,
          currency: 'BRL',
          itinerary: [],
          offerSignature: 'sig-stale',
          deeplink: null,
          expiresAt: null,
          qualityFlags: [],
          observationKey,
          selectionPolicyVersion: 1,
          normalizerVersion: 1,
          offersReceivedCount: 1,
          nextCheckAt: new Date(Date.now() + 3_600_000),
        }),
      ),
    ).rejects.toBeInstanceOf(StaleLeaseError);

    const observationCount = await prisma.priceObservation.count({ where: { observationKey } });
    expect(observationCount).toBe(0);
    const outboxCount = await prisma.outboxEvent.count({
      where: {
        eventType: 'PriceObserved.v1',
        payload: { path: ['observationKey'], equals: observationKey },
      },
    });
    expect(outboxCount).toBe(0);
  });

  // AC-003: uma execução nova, criada depois da reconciliação, processa normalmente.
  it('lets a new execution created after reconciliation persist normally', async () => {
    const { target } = await seedTarget();
    const abandonedExecution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    await claimForTest(prisma, abandonedExecution.id);
    await prisma.$transaction((tx) => reconcileAbandonedSearchExecutions(tx, -1));

    const freshExecution = await createScheduledSearchExecution(prisma, {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    const freshLeaseToken = await claimForTest(prisma, freshExecution.id);

    const { created } = await prisma.$transaction((tx) =>
      persistPriceObservationSuccess(tx, {
        searchExecutionId: freshExecution.id,
        leaseToken: freshLeaseToken,
        searchTargetId: target.id,
        providerStrategy: 'SIMULATED',
        correlationId: randomUUID(),
        observedAt: new Date(),
        totalAmountMinor: 88_000,
        currency: 'BRL',
        itinerary: [],
        offerSignature: 'sig-fresh',
        deeplink: null,
        expiresAt: null,
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
        offersReceivedCount: 1,
        nextCheckAt: new Date(Date.now() + 3_600_000),
      }),
    );

    expect(created).toBe(true);
    const updated = await prisma.searchExecution.findUniqueOrThrow({
      where: { id: freshExecution.id },
    });
    expect(updated.status).toBe('SUCCEEDED');
  });
});
