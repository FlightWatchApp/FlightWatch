import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Job } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';
import type { PriceObservedJob } from '@flight-watch/queue';
import { evaluatePriceObservedJob } from './evaluate.js';
import { createAlertWorkerMetrics } from './metrics.js';

const metrics = createAlertWorkerMetrics();

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

async function seedWatchWithRule(
  ruleData: Partial<{
    type: 'TARGET_PRICE' | 'PERCENTAGE_DROP' | 'ABSOLUTE_DROP' | 'NEW_OBSERVED_LOW';
    targetAmountMinor: number | null;
    dropPercent: number | null;
    dropAmountMinor: number | null;
    referenceStrategy:
      'PREVIOUS_VALID_OBSERVATION' | 'FIRST_VALID_OBSERVATION' | 'LOWEST_VALID_OBSERVATION' | null;
    cooldownSeconds: number;
  }>,
  watchOverrides: Partial<{ status: 'ACTIVE' | 'PAUSED'; startsAt: Date }> = {},
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
      departureDate: new Date('2027-01-01'),
      tripType: 'ONE_WAY',
      cabin: 'ECONOMY',
      adults: 1,
      currency: 'BRL',
      market: 'BR',
      checkIntervalSeconds: 14_400,
    },
  });
  const watch = await prisma.watch.create({
    data: {
      userId: user.id,
      searchTargetId: target.id,
      notificationChannelId: channel.id,
      status: watchOverrides.status ?? 'ACTIVE',
      startsAt: watchOverrides.startsAt ?? new Date(Date.now() - 3_600_000),
    },
  });
  const rule = await prisma.alertRule.create({
    data: {
      watchId: watch.id,
      type: ruleData.type ?? 'TARGET_PRICE',
      targetAmountMinor: ruleData.targetAmountMinor ?? null,
      dropPercent: ruleData.dropPercent ?? null,
      dropAmountMinor: ruleData.dropAmountMinor ?? null,
      referenceStrategy: ruleData.referenceStrategy ?? null,
      cooldownSeconds: ruleData.cooldownSeconds ?? 3600,
    },
  });
  return { user, channel, target, watch, rule };
}

async function createObservation(
  targetId: string,
  amountMinor: number,
  observedAt: Date = new Date(),
) {
  const execution = await prisma.searchExecution.create({
    data: {
      searchTargetId: targetId,
      providerStrategy: 'SIMULATED',
      status: 'SUCCEEDED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    },
  });
  return prisma.priceObservation.create({
    data: {
      searchTargetId: targetId,
      searchExecutionId: execution.id,
      providerStrategy: 'SIMULATED',
      observedAt,
      totalAmountMinor: amountMinor,
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

function fakeJob(searchTargetId: string, priceObservationId: string): Job<PriceObservedJob> {
  return {
    data: {
      eventId: randomUUID(),
      searchTargetId,
      priceObservationId,
      amountMinor: 0,
      currency: 'BRL',
      observedAt: new Date().toISOString(),
      selectionPolicyVersion: 1,
      correlationId: randomUUID(),
    },
  } as Job<PriceObservedJob>;
}

describe('evaluatePriceObservedJob', () => {
  // AC-001: preço igual ao alvo dispara.
  it('triggers TARGET_PRICE when the price equals the target', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'TARGET_PRICE',
      targetAmountMinor: 80_000,
    });
    const observation = await createObservation(target.id, 80_000);

    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, observation.id));

    const event = await prisma.alertEvent.findFirst({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(event?.status).toBe('QUEUED');

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'NotificationRequested.v1' },
    });
    expect(outbox).not.toBeNull();
  });

  // AC-002/AC-003: 20% de queda dispara regra de 15%; 7% não dispara.
  it('triggers PERCENTAGE_DROP correctly against the previous observation', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'PERCENTAGE_DROP',
      dropPercent: 15,
      referenceStrategy: 'PREVIOUS_VALID_OBSERVATION',
    });
    const reference = await createObservation(target.id, 100_000, new Date(Date.now() - 10_000));
    const current = await createObservation(target.id, 80_000);

    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, current.id));

    const event = await prisma.alertEvent.findFirst({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(event?.status).toBe('QUEUED');
    expect(event?.referenceAmountMinor).toBe(reference.totalAmountMinor);
  });

  it('does not trigger PERCENTAGE_DROP when the drop is below the threshold', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'PERCENTAGE_DROP',
      dropPercent: 15,
      referenceStrategy: 'PREVIOUS_VALID_OBSERVATION',
    });
    await createObservation(target.id, 100_000, new Date(Date.now() - 10_000));
    const current = await createObservation(target.id, 93_000);

    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, current.id));

    const event = await prisma.alertEvent.findFirst({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(event).toBeNull();
  });

  // SPEC-005 AC-005: Watch pausado não gera alerta entregável.
  it('does not evaluate rules for a paused watch', async () => {
    const { target, watch, rule } = await seedWatchWithRule(
      { type: 'TARGET_PRICE', targetAmountMinor: 80_000 },
      { status: 'PAUSED' },
    );
    const observation = await createObservation(target.id, 70_000);

    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, observation.id));

    const event = await prisma.alertEvent.findFirst({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(event).toBeNull();
  });

  // ADR-007 / SPEC-005 §14: prova que as métricas reagem a uma avaliação
  // real, não só que os contadores existem.
  it('records rulesEvaluatedTotal, eventsTotal, pagesProcessedTotal, and eventLagSeconds', async () => {
    const localMetrics = createAlertWorkerMetrics();
    const { target } = await seedWatchWithRule({
      type: 'TARGET_PRICE',
      targetAmountMinor: 80_000,
    });
    const observedAt = new Date(Date.now() - 5_000);
    const observation = await createObservation(target.id, 80_000, observedAt);
    const job = fakeJob(target.id, observation.id);
    job.data.observedAt = observedAt.toISOString();

    await evaluatePriceObservedJob({ prisma, metrics: localMetrics }, job);

    const body = await localMetrics.registry.metrics();
    expect(body).toContain('alert_rules_evaluated_total{type="TARGET_PRICE",result="triggered"} 1');
    expect(body).toContain('alert_events_total{outcome="queued"} 1');
    expect(body).toContain('alert_worker_pages_processed_total 1');
    expect(body).toMatch(/alert_event_lag_seconds_count \d+/);
    const sumMatch = /alert_event_lag_seconds_sum (\d+(?:\.\d+)?)/.exec(body);
    expect(sumMatch?.[1] ? Number(sumMatch[1]) : 0).toBeGreaterThanOrEqual(5);
  });

  // AC-010: histórico anterior à ativação do Watch não dispara por padrão.
  it('ignores observations recorded before the watch startsAt', async () => {
    const beforeActivation = new Date(Date.now() - 2_000_000);
    const startsAt = new Date(Date.now() - 1_000_000);
    const { target, watch, rule } = await seedWatchWithRule(
      { type: 'PERCENTAGE_DROP', dropPercent: 5, referenceStrategy: 'PREVIOUS_VALID_OBSERVATION' },
      { startsAt },
    );
    await createObservation(target.id, 10_000, beforeActivation); // preço absurdamente baixo, antes da ativação
    const current = await createObservation(target.id, 90_000, new Date());

    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, current.id));

    // Sem referência válida desde a ativação, a regra relativa não dispara.
    const event = await prisma.alertEvent.findFirst({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(event).toBeNull();
  });

  // AC-006: cooldown suprime a segunda ocorrência com evidência auditável.
  it('suppresses a second trigger within the cooldown window', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'TARGET_PRICE',
      targetAmountMinor: 100_000,
      cooldownSeconds: 3600,
    });
    const firstObservation = await createObservation(target.id, 90_000);
    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, firstObservation.id));

    const secondObservation = await createObservation(target.id, 85_000);
    await evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, secondObservation.id));

    const events = await prisma.alertEvent.findMany({
      where: { watchId: watch.id, alertRuleId: rule.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(2);
    const [queuedEvent, suppressedEvent] = events;
    if (!queuedEvent || !suppressedEvent) {
      throw new Error('expected exactly two alert events');
    }
    expect(queuedEvent.status).toBe('QUEUED');
    expect(suppressedEvent.status).toBe('SUPPRESSED');
    expect(suppressedEvent.suppressionReason).toBe('COOLDOWN_ACTIVE');

    // Evento suprimido não pede entrega: só o QUEUED gerou NotificationRequested.v1.
    const queuedOutboxCount = await prisma.outboxEvent.count({
      where: {
        eventType: 'NotificationRequested.v1',
        payload: { path: ['alertEventId'], equals: queuedEvent.id },
      },
    });
    expect(queuedOutboxCount).toBe(1);
    const suppressedOutboxCount = await prisma.outboxEvent.count({
      where: {
        eventType: 'NotificationRequested.v1',
        payload: { path: ['alertEventId'], equals: suppressedEvent.id },
      },
    });
    expect(suppressedOutboxCount).toBe(0);
  });

  // AC-007: o mesmo evento processado três vezes cria um AlertEvent só.
  it('is idempotent when the same job is processed multiple times', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'TARGET_PRICE',
      targetAmountMinor: 80_000,
    });
    const observation = await createObservation(target.id, 80_000);
    const job = fakeJob(target.id, observation.id);
    const localMetrics = createAlertWorkerMetrics();

    await evaluatePriceObservedJob({ prisma, metrics: localMetrics }, job);
    await evaluatePriceObservedJob({ prisma, metrics: localMetrics }, job);
    await evaluatePriceObservedJob({ prisma, metrics: localMetrics }, job);

    const events = await prisma.alertEvent.findMany({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(events).toHaveLength(1);
    const [onlyEvent] = events;
    if (!onlyEvent) {
      throw new Error('expected exactly one alert event');
    }

    const outboxCount = await prisma.outboxEvent.count({
      where: {
        eventType: 'NotificationRequested.v1',
        payload: { path: ['alertEventId'], equals: onlyEvent.id },
      },
    });
    expect(outboxCount).toBe(1);

    const body = await localMetrics.registry.metrics();
    expect(body).toContain('alert_events_total{outcome="queued"} 1');
    expect(body).toContain('alert_events_total{outcome="idempotent_replay"} 2');
    expect(body).toMatch(/alert_event_lag_seconds_count 1/);
  });

  it('does nothing when the price observation no longer exists', async () => {
    await expect(
      evaluatePriceObservedJob({ prisma, metrics }, fakeJob(randomUUID(), randomUUID())),
    ).resolves.toBeUndefined();
  });

  // Regressão: findOrCreateAlertEvent é um find-then-create; sem retry na
  // corrida de unicidade, duas avaliações concorrentes do mesmo job (redelivery
  // sobreposto ao original) faziam uma delas lançar um erro de constraint e
  // abortar a transação em vez de convergir para o mesmo AlertEvent.
  it('converges two concurrent evaluations of the same job onto a single AlertEvent', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'TARGET_PRICE',
      targetAmountMinor: 80_000,
    });
    const observation = await createObservation(target.id, 80_000);
    const job = fakeJob(target.id, observation.id);

    await Promise.all([
      evaluatePriceObservedJob({ prisma, metrics }, job),
      evaluatePriceObservedJob({ prisma, metrics }, job),
    ]);

    const events = await prisma.alertEvent.findMany({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(events).toHaveLength(1);
  });

  // Regressão: isCooldownActive lia FORA da transação que cria o AlertEvent.
  // Duas observações DIFERENTES da mesma regra (não redelivery do mesmo job —
  // deduplicationKey é diferente pra cada uma, então a proteção do teste
  // acima não cobre este caso) avaliadas ao mesmo tempo liam "cooldown
  // inativo" antes de qualquer commit e ambas disparavam QUEUED, exatamente o
  // que o cooldown deveria impedir. Só uma pode QUEUED; a outra SUPPRESSED.
  it('cooldown suppresses one of two different observations evaluated concurrently for the same rule', async () => {
    const { target, watch, rule } = await seedWatchWithRule({
      type: 'TARGET_PRICE',
      targetAmountMinor: 100_000,
      cooldownSeconds: 3600,
    });
    const firstObservation = await createObservation(target.id, 90_000);
    const secondObservation = await createObservation(target.id, 85_000);

    await Promise.all([
      evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, firstObservation.id)),
      evaluatePriceObservedJob({ prisma, metrics }, fakeJob(target.id, secondObservation.id)),
    ]);

    const events = await prisma.alertEvent.findMany({
      where: { watchId: watch.id, alertRuleId: rule.id },
    });
    expect(events).toHaveLength(2);
    const queuedEvents = events.filter((event) => event.status === 'QUEUED');
    const suppressedEvents = events.filter((event) => event.status === 'SUPPRESSED');
    expect(queuedEvents).toHaveLength(1);
    expect(suppressedEvents).toHaveLength(1);

    // Só o QUEUED pede entrega — se os dois tivessem disparado, haveria duas
    // notificações pra um único cooldown, o bug que este teste existe pra pegar.
    // Contagem escopada ao evento QUEUED desta rodada (container Postgres
    // compartilhado entre testes deste arquivo, sem truncar tabelas).
    const queuedEvent = queuedEvents[0];
    if (!queuedEvent) {
      throw new Error('expected exactly one queued event');
    }
    const notificationRequests = await prisma.outboxEvent.count({
      where: {
        eventType: 'NotificationRequested.v1',
        payload: { path: ['alertEventId'], equals: queuedEvent.id },
      },
    });
    expect(notificationRequests).toBe(1);

    const suppressedEvent = suppressedEvents[0];
    if (!suppressedEvent) {
      throw new Error('expected exactly one suppressed event');
    }
    const suppressedNotificationRequests = await prisma.outboxEvent.count({
      where: {
        eventType: 'NotificationRequested.v1',
        payload: { path: ['alertEventId'], equals: suppressedEvent.id },
      },
    });
    expect(suppressedNotificationRequests).toBe(0);
  });
});
