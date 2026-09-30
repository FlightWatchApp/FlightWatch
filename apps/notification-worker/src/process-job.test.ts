import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Job } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, createPrismaClient } from '@flight-watch/database';
import { InMemoryEmailSender, failingSendBehavior } from '@flight-watch/notifications';
import type { NotificationRequestedJob } from '@flight-watch/queue';
import { createNotificationWorkerMetrics } from './metrics.js';
import { type NotificationWorkerDeps, processNotificationJob } from './process-job.js';

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

async function seedQueuedAlertEvent(
  channelOverrides: { status?: 'ACTIVE' | 'REVOKED'; verifiedAt?: Date | null } = {},
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
      status: channelOverrides.status ?? 'ACTIVE',
      verifiedAt:
        channelOverrides.verifiedAt === undefined ? new Date() : channelOverrides.verifiedAt,
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
      status: 'ACTIVE',
    },
  });
  const rule = await prisma.alertRule.create({
    data: {
      watchId: watch.id,
      type: 'TARGET_PRICE',
      targetAmountMinor: 80_000,
      cooldownSeconds: 3600,
    },
  });
  const execution = await prisma.searchExecution.create({
    data: {
      searchTargetId: target.id,
      providerStrategy: 'SIMULATED',
      status: 'SUCCEEDED',
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    },
  });
  const observation = await prisma.priceObservation.create({
    data: {
      searchTargetId: target.id,
      searchExecutionId: execution.id,
      providerStrategy: 'SIMULATED',
      observedAt: new Date(),
      totalAmountMinor: 78_000,
      currency: 'BRL',
      itinerary: [],
      offerSignature: randomUUID(),
      qualityFlags: [],
      observationKey: randomUUID(),
      selectionPolicyVersion: 1,
      normalizerVersion: 1,
    },
  });
  const alertEvent = await prisma.alertEvent.create({
    data: {
      watchId: watch.id,
      alertRuleId: rule.id,
      priceObservationId: observation.id,
      triggerType: 'TARGET_PRICE',
      ruleVersion: 1,
      referenceAmountMinor: null,
      currentAmountMinor: 78_000,
      currency: 'BRL',
      deduplicationKey: randomUUID(),
      status: 'QUEUED',
      justification: {},
    },
  });
  return { user, channel, target, watch, alertEvent };
}

function fakeJob(alertEventId: string): Job<NotificationRequestedJob> {
  return {
    data: {
      eventId: randomUUID(),
      alertEventId,
      channel: 'EMAIL',
      templateVersion: 1,
      correlationId: randomUUID(),
    },
  } as Job<NotificationRequestedJob>;
}

function baseDeps(emailSender: InMemoryEmailSender): NotificationWorkerDeps {
  return {
    prisma,
    emailSender,
    buildUnsubscribeUrl: (watchId) => `https://example.com/watches/${watchId}/preferences`,
    metrics: createNotificationWorkerMetrics(),
  };
}

describe('processNotificationJob', () => {
  // AC-001: alerta válido gera uma mensagem com a regra explicada.
  it('delivers the email and marks the delivery and alert event as notified', async () => {
    const { alertEvent, channel } = await seedQueuedAlertEvent();
    const sender = new InMemoryEmailSender();

    await processNotificationJob(baseDeps(sender), fakeJob(alertEvent.id));

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe(channel.destination);
    expect(sender.sent[0]?.textBody).toContain('valor-alvo');

    const delivery = await prisma.notificationDelivery.findFirst({
      where: { alertEventId: alertEvent.id },
    });
    expect(delivery?.status).toBe('DELIVERED');

    const updatedEvent = await prisma.alertEvent.findUniqueOrThrow({
      where: { id: alertEvent.id },
    });
    expect(updatedEvent.status).toBe('NOTIFIED');
  });

  // ADR-007 / SPEC-006 §12: prova que as métricas reagem a uma entrega real.
  it('records deliveriesTotal, deliveryAttemptsTotal, and deliveryLagSeconds on success', async () => {
    const { alertEvent } = await seedQueuedAlertEvent();
    const sender = new InMemoryEmailSender();
    const deps = baseDeps(sender);

    await processNotificationJob(deps, fakeJob(alertEvent.id));

    const body = await deps.metrics.registry.metrics();
    expect(body).toContain(
      'notification_deliveries_total{channel="EMAIL",status="delivered",templateVersion="1"} 1',
    );
    expect(body).toContain('notification_delivery_attempts_total{channel="EMAIL"} 1');
    expect(body).toMatch(/notification_delivery_lag_seconds_count\{channel="EMAIL"\} \d+/);
  });

  // EVAL-NOTIFY-004: canal não verificado -> entrega suprimida com registro
  // terminal e auditável (regressão: antes disso o evento ficava preso em
  // QUEUED para sempre, sem nenhuma NotificationDelivery explicando por quê).
  it('does not send when the channel is not verified, and leaves an auditable terminal record', async () => {
    const { alertEvent } = await seedQueuedAlertEvent({ verifiedAt: null });
    const sender = new InMemoryEmailSender();

    await processNotificationJob(baseDeps(sender), fakeJob(alertEvent.id));

    expect(sender.sent).toHaveLength(0);
    const updatedEvent = await prisma.alertEvent.findUniqueOrThrow({
      where: { id: alertEvent.id },
    });
    expect(updatedEvent.status).toBe('FAILED');

    const delivery = await prisma.notificationDelivery.findFirst({
      where: { alertEventId: alertEvent.id },
    });
    expect(delivery?.status).toBe('PERMANENT_FAILURE');
    expect(delivery?.errorCode).toBe('CHANNEL_NOT_VERIFIED');
  });

  it('does not send when the channel is revoked, and leaves an auditable terminal record', async () => {
    const { alertEvent } = await seedQueuedAlertEvent({ status: 'REVOKED' });
    const sender = new InMemoryEmailSender();

    await processNotificationJob(baseDeps(sender), fakeJob(alertEvent.id));

    expect(sender.sent).toHaveLength(0);
    const updatedEvent = await prisma.alertEvent.findUniqueOrThrow({
      where: { id: alertEvent.id },
    });
    expect(updatedEvent.status).toBe('FAILED');
  });

  // AC-002: redelivery do job não gera segunda mensagem lógica.
  it('is idempotent when the same job is processed twice', async () => {
    const { alertEvent } = await seedQueuedAlertEvent();
    const sender = new InMemoryEmailSender();
    const job = fakeJob(alertEvent.id);

    await processNotificationJob(baseDeps(sender), job);
    await processNotificationJob(baseDeps(sender), job);

    expect(sender.sent).toHaveLength(1);
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { alertEventId: alertEvent.id },
    });
    expect(deliveries).toHaveLength(1);
  });

  // Regressão: markNotificationDeliverySending fazia um update incondicional
  // depois de checar `status` fora de qualquer trava — duas entregas
  // concorrentes do MESMO job liam o status antes de qualquer uma escrever, e
  // as duas chamavam emailSender.send. Rodar de verdade em paralelo (não em
  // sequência, como o teste de idempotência acima) é o que exercita a corrida.
  it('sends exactly once when the same job is processed concurrently, not sequentially', async () => {
    const { alertEvent } = await seedQueuedAlertEvent();
    const sender = new InMemoryEmailSender();
    const job = fakeJob(alertEvent.id);

    await Promise.all([
      processNotificationJob(baseDeps(sender), job),
      processNotificationJob(baseDeps(sender), job),
    ]);

    expect(sender.sent).toHaveLength(1);
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { alertEventId: alertEvent.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('DELIVERED');
  });

  // AC-003/EVAL-PROVIDER-style: falha temporária é retentável; worker relança.
  it('marks a retryable failure and throws so BullMQ retries, without failing the AlertEvent', async () => {
    const { alertEvent } = await seedQueuedAlertEvent();
    const sender = new InMemoryEmailSender(failingSendBehavior('TIMEOUT', 'simulated timeout'));
    const deps = baseDeps(sender);

    await expect(processNotificationJob(deps, fakeJob(alertEvent.id))).rejects.toThrow();

    const delivery = await prisma.notificationDelivery.findFirst({
      where: { alertEventId: alertEvent.id },
    });
    expect(delivery?.status).toBe('RETRYABLE_FAILURE');

    const updatedEvent = await prisma.alertEvent.findUniqueOrThrow({
      where: { id: alertEvent.id },
    });
    expect(updatedEvent.status).toBe('QUEUED');

    const body = await deps.metrics.registry.metrics();
    expect(body).toContain(
      'notification_deliveries_total{channel="EMAIL",status="retryable_failure",templateVersion="1"} 1',
    );
    expect(body).toContain('notification_delivery_attempts_total{channel="EMAIL"} 1');
    expect(body).not.toContain('notification_delivery_lag_seconds_count{channel="EMAIL"}');
  });

  // AC-004: falha permanente não entra em retry infinito.
  it('marks a permanent failure and does not throw, and marks the AlertEvent failed', async () => {
    const { alertEvent } = await seedQueuedAlertEvent();
    const sender = new InMemoryEmailSender(
      failingSendBehavior('PERMANENT_BOUNCE', 'invalid address'),
    );

    await expect(
      processNotificationJob(baseDeps(sender), fakeJob(alertEvent.id)),
    ).resolves.toBeUndefined();

    const delivery = await prisma.notificationDelivery.findFirst({
      where: { alertEventId: alertEvent.id },
    });
    expect(delivery?.status).toBe('PERMANENT_FAILURE');

    const updatedEvent = await prisma.alertEvent.findUniqueOrThrow({
      where: { id: alertEvent.id },
    });
    expect(updatedEvent.status).toBe('FAILED');
  });

  it('does nothing when the AlertEvent does not exist', async () => {
    const sender = new InMemoryEmailSender();
    await expect(
      processNotificationJob(baseDeps(sender), fakeJob(randomUUID())),
    ).resolves.toBeUndefined();
    expect(sender.sent).toHaveLength(0);
  });
});
