import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findLastQueuedOrNotifiedAlertEvent,
  findFirstValidObservation,
  findLowestValidObservation,
  findOrCreateAlertEvent,
  findPreviousValidObservation,
  selectActiveWatchesPage,
} from './alert-event-repository.js';
import { type PrismaClient, createPrismaClient } from './client.js';
import {
  claimNotificationDeliveryForSending,
  findAlertEventForDelivery,
  findOrCreateNotificationDelivery,
  markAlertEventFailed,
  markAlertEventNotified,
  markNotificationDeliveryResult,
  reconcileStaleSendingNotificationDeliveries,
} from './notification-delivery-repository.js';
import {
  findLowPriceReferences,
  findLowPriceReferencesForTargets,
} from './low-price-repository.js';
import { backfillLowPriceRules, revertLowPriceRules } from './low-price-backfill.js';

// SPEC-012: mesmo placeholder de apps/notification-worker/src/process-job.ts.
const STALE_SENDING_THRESHOLD_MS = 5 * 60 * 1000;

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

async function seedTargetWithWatch(watchStartsAt: Date = new Date(Date.now() - 3_600_000)) {
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
      status: 'ACTIVE',
      startsAt: watchStartsAt,
    },
  });
  const rule = await prisma.alertRule.create({
    data: { watchId: watch.id, type: 'PERCENTAGE_DROP', dropPercent: 15, cooldownSeconds: 3600 },
  });
  return { user, channel, target, watch, rule };
}

async function createObservation(targetId: string, amountMinor: number, observedAt: Date) {
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

describe('selectActiveWatchesPage', () => {
  it('paginates active watches by cursor and includes only enabled rules', async () => {
    const { target, watch: firstWatch } = await seedTargetWithWatch();

    const secondUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        status: 'ACTIVE',
        timezone: 'America/Sao_Paulo',
        passwordHash: 'not-a-real-hash-this-test-never-logs-in',
      },
    });
    const secondChannel = await prisma.notificationChannel.create({
      data: {
        userId: secondUser.id,
        type: 'EMAIL',
        destination: secondUser.email,
        status: 'ACTIVE',
        verifiedAt: new Date(),
      },
    });
    const secondWatch = await prisma.watch.create({
      data: {
        userId: secondUser.id,
        searchTargetId: target.id,
        notificationChannelId: secondChannel.id,
        status: 'ACTIVE',
      },
    });

    const firstPage = await prisma.$transaction((tx) =>
      selectActiveWatchesPage(tx, { searchTargetId: target.id, cursor: null, limit: 1 }),
    );
    expect(firstPage).toHaveLength(1);

    const secondPage = await prisma.$transaction((tx) =>
      selectActiveWatchesPage(tx, {
        searchTargetId: target.id,
        cursor: firstPage[0]?.id ?? null,
        limit: 1,
      }),
    );
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]?.id).not.toBe(firstPage[0]?.id);

    const allIds = [firstPage[0]?.id, secondPage[0]?.id];
    expect(allIds).toContain(firstWatch.id);
    expect(allIds).toContain(secondWatch.id);
  });
});

describe('reference observation resolvers', () => {
  it('finds the previous, first, and lowest valid observations, excluding the current one', async () => {
    const { target, watch } = await seedTargetWithWatch();
    const t0 = new Date(Date.now() - 3_000_000);
    const t1 = new Date(Date.now() - 2_000_000);
    const t2 = new Date(Date.now() - 1_000_000);

    const first = await createObservation(target.id, 100_000, t0);
    const middle = await createObservation(target.id, 95_000, t1);
    const current = await createObservation(target.id, 98_000, t2);

    const previous = await findPreviousValidObservation(prisma, {
      searchTargetId: target.id,
      watchStartsAt: watch.startsAt,
      excludeObservationId: current.id,
      beforeOrAt: current.observedAt,
    });
    expect(previous?.id).toBe(middle.id);

    const firstValid = await findFirstValidObservation(prisma, {
      searchTargetId: target.id,
      watchStartsAt: watch.startsAt,
      excludeObservationId: current.id,
    });
    expect(firstValid?.id).toBe(first.id);

    const lowest = await findLowestValidObservation(prisma, {
      searchTargetId: target.id,
      watchStartsAt: watch.startsAt,
      excludeObservationId: current.id,
    });
    expect(lowest?.id).toBe(middle.id);
  });

  // SPEC-005 §5: só observações a partir de watch.startsAt participam.
  it('ignores observations before the watch startsAt', async () => {
    const watchStartsAt = new Date(Date.now() - 1_000_000);
    const { target, watch } = await seedTargetWithWatch(watchStartsAt);
    const beforeActivation = await createObservation(
      target.id,
      50_000,
      new Date(Date.now() - 2_000_000),
    );
    const current = await createObservation(target.id, 90_000, new Date());

    const previous = await findPreviousValidObservation(prisma, {
      searchTargetId: target.id,
      watchStartsAt: watch.startsAt,
      excludeObservationId: current.id,
      beforeOrAt: current.observedAt,
    });
    expect(previous?.id).not.toBe(beforeActivation.id);
    expect(previous).toBeNull();
  });
});

describe('findOrCreateAlertEvent', () => {
  it('is idempotent for the same deduplicationKey', async () => {
    const { target, watch, rule } = await seedTargetWithWatch();
    const observation = await createObservation(target.id, 90_000, new Date());
    const deduplicationKey = randomUUID();
    const input = {
      watchId: watch.id,
      alertRuleId: rule.id,
      priceObservationId: observation.id,
      triggerType: 'PERCENTAGE_DROP' as const,
      ruleVersion: 1,
      referenceAmountMinor: 100_000,
      currentAmountMinor: 90_000,
      currency: 'BRL',
      deduplicationKey,
      status: 'QUEUED' as const,
      suppressionReason: null,
      justification: { dropPercent: 10 },
    };

    const first = await prisma.$transaction((tx) => findOrCreateAlertEvent(tx, input));
    const second = await prisma.$transaction((tx) => findOrCreateAlertEvent(tx, input));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);

    const count = await prisma.alertEvent.count({ where: { deduplicationKey } });
    expect(count).toBe(1);
  });

  it('finds the last queued/notified event for cooldown, ignoring suppressed ones', async () => {
    const { target, watch, rule } = await seedTargetWithWatch();
    const observation = await createObservation(target.id, 90_000, new Date());

    await prisma.$transaction((tx) =>
      findOrCreateAlertEvent(tx, {
        watchId: watch.id,
        alertRuleId: rule.id,
        priceObservationId: observation.id,
        triggerType: 'PERCENTAGE_DROP',
        ruleVersion: 1,
        referenceAmountMinor: 100_000,
        currentAmountMinor: 90_000,
        currency: 'BRL',
        deduplicationKey: randomUUID(),
        status: 'SUPPRESSED',
        suppressionReason: 'COOLDOWN_ACTIVE',
        justification: {},
      }),
    );

    const beforeQueued = await findLastQueuedOrNotifiedAlertEvent(prisma, {
      watchId: watch.id,
      alertRuleId: rule.id,
    });
    expect(beforeQueued).toBeNull();

    await prisma.$transaction((tx) =>
      findOrCreateAlertEvent(tx, {
        watchId: watch.id,
        alertRuleId: rule.id,
        priceObservationId: observation.id,
        triggerType: 'PERCENTAGE_DROP',
        ruleVersion: 1,
        referenceAmountMinor: 100_000,
        currentAmountMinor: 88_000,
        currency: 'BRL',
        deduplicationKey: randomUUID(),
        status: 'QUEUED',
        suppressionReason: null,
        justification: {},
      }),
    );

    const afterQueued = await findLastQueuedOrNotifiedAlertEvent(prisma, {
      watchId: watch.id,
      alertRuleId: rule.id,
    });
    expect(afterQueued).not.toBeNull();
  });
});

describe('notification delivery repository', () => {
  it('is idempotent for the same deliveryKey and tracks the full lifecycle', async () => {
    const { target, watch, rule, channel } = await seedTargetWithWatch();
    const observation = await createObservation(target.id, 90_000, new Date());
    const { event } = await prisma.$transaction((tx) =>
      findOrCreateAlertEvent(tx, {
        watchId: watch.id,
        alertRuleId: rule.id,
        priceObservationId: observation.id,
        triggerType: 'PERCENTAGE_DROP',
        ruleVersion: 1,
        referenceAmountMinor: 100_000,
        currentAmountMinor: 90_000,
        currency: 'BRL',
        deduplicationKey: randomUUID(),
        status: 'QUEUED',
        suppressionReason: null,
        justification: {},
      }),
    );

    const loaded = await prisma.$transaction((tx) => findAlertEventForDelivery(tx, event.id));
    expect(loaded?.watch.notificationChannel.id).toBe(channel.id);

    const deliveryKey = randomUUID();
    const first = await prisma.$transaction((tx) =>
      findOrCreateNotificationDelivery(tx, {
        alertEventId: event.id,
        channel: 'EMAIL',
        destinationRef: channel.id,
        deliveryKey,
        templateVersion: 1,
      }),
    );
    const second = await prisma.$transaction((tx) =>
      findOrCreateNotificationDelivery(tx, {
        alertEventId: event.id,
        channel: 'EMAIL',
        destinationRef: channel.id,
        deliveryKey,
        templateVersion: 1,
      }),
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.delivery.id).toBe(first.delivery.id);

    const claimed = await prisma.$transaction((tx) =>
      claimNotificationDeliveryForSending(tx, first.delivery.id, STALE_SENDING_THRESHOLD_MS),
    );
    expect(claimed?.status).toBe('SENDING');
    expect(claimed?.attempt).toBe(1);

    await prisma.$transaction((tx) =>
      markNotificationDeliveryResult(tx, {
        deliveryId: first.delivery.id,
        status: 'DELIVERED',
        providerMessageId: 'msg-1',
      }),
    );
    await prisma.$transaction((tx) => markAlertEventNotified(tx, event.id));

    const delivered = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: first.delivery.id },
    });
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.providerMessageId).toBe('msg-1');

    const notifiedEvent = await prisma.alertEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(notifiedEvent.status).toBe('NOTIFIED');

    // Regressão: claimNotificationDeliveryForSending precisa recusar reivindicar
    // uma entrega já DELIVERED — sem essa guarda, um redelivery do job podia
    // reenviar um email já entregue.
    const reclaimAttempt = await prisma.$transaction((tx) =>
      claimNotificationDeliveryForSending(tx, first.delivery.id, STALE_SENDING_THRESHOLD_MS),
    );
    expect(reclaimAttempt).toBeNull();
  });

  it('marks the AlertEvent failed on permanent delivery failure', async () => {
    const { target, watch, rule } = await seedTargetWithWatch();
    const observation = await createObservation(target.id, 90_000, new Date());
    const { event } = await prisma.$transaction((tx) =>
      findOrCreateAlertEvent(tx, {
        watchId: watch.id,
        alertRuleId: rule.id,
        priceObservationId: observation.id,
        triggerType: 'PERCENTAGE_DROP',
        ruleVersion: 1,
        referenceAmountMinor: 100_000,
        currentAmountMinor: 90_000,
        currency: 'BRL',
        deduplicationKey: randomUUID(),
        status: 'QUEUED',
        suppressionReason: null,
        justification: {},
      }),
    );

    await prisma.$transaction((tx) => markAlertEventFailed(tx, event.id));
    const failed = await prisma.alertEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(failed.status).toBe('FAILED');
  });

  // SPEC-012: recuperação de entrega presa em SENDING.
  describe('stale SENDING recovery', () => {
    async function seedSendingDelivery(sendingUpdatedAt: Date) {
      const { watch, rule } = await seedTargetWithWatch();
      const observation = await createObservation(watch.searchTargetId, 90_000, new Date());
      const { event } = await prisma.$transaction((tx) =>
        findOrCreateAlertEvent(tx, {
          watchId: watch.id,
          alertRuleId: rule.id,
          priceObservationId: observation.id,
          triggerType: 'PERCENTAGE_DROP',
          ruleVersion: 1,
          referenceAmountMinor: 100_000,
          currentAmountMinor: 90_000,
          currency: 'BRL',
          deduplicationKey: randomUUID(),
          status: 'QUEUED',
          suppressionReason: null,
          justification: {},
        }),
      );
      const { delivery } = await prisma.$transaction((tx) =>
        findOrCreateNotificationDelivery(tx, {
          alertEventId: event.id,
          channel: 'EMAIL',
          destinationRef: randomUUID(),
          deliveryKey: randomUUID(),
          templateVersion: 3,
        }),
      );
      await prisma.$transaction((tx) =>
        claimNotificationDeliveryForSending(tx, delivery.id, STALE_SENDING_THRESHOLD_MS),
      );
      // Simula o tempo passado desde a última escrita (a coluna é @updatedAt,
      // não dá pra sobrescrever via update comum sem também mudar outro campo
      // — usa $executeRaw pra fixar o timestamp de teste diretamente).
      await prisma.$executeRaw`UPDATE notification_deliveries SET "updatedAt" = ${sendingUpdatedAt} WHERE id = ${delivery.id}`;
      return { delivery, event };
    }

    // AC-004: SENDING recente não é tocado.
    it('does not claim a SENDING delivery that is still within the threshold', async () => {
      const { delivery } = await seedSendingDelivery(new Date());
      const reclaimed = await prisma.$transaction((tx) =>
        claimNotificationDeliveryForSending(tx, delivery.id, STALE_SENDING_THRESHOLD_MS),
      );
      expect(reclaimed).toBeNull();
    });

    // AC-001/AC-002 (parte do fluxo normal): SENDING além do threshold pode
    // ser reivindicada de novo diretamente (cobre o caso de o próprio BullMQ
    // redeliverar o job original).
    it('claims a SENDING delivery whose updatedAt is older than the threshold', async () => {
      const staleUpdatedAt = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS - 1000);
      const { delivery } = await seedSendingDelivery(staleUpdatedAt);
      const reclaimed = await prisma.$transaction((tx) =>
        claimNotificationDeliveryForSending(tx, delivery.id, STALE_SENDING_THRESHOLD_MS),
      );
      expect(reclaimed?.status).toBe('SENDING');
      expect(reclaimed?.attempt).toBe(2);
    });

    // AC-001: a reconciliação explícita encontra e resolve a entrega presa,
    // devolvendo os dados necessários pra reenfileirar.
    it('reconcileStaleSendingNotificationDeliveries resolves a stuck delivery and returns its data', async () => {
      const staleUpdatedAt = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS - 1000);
      const { delivery, event } = await seedSendingDelivery(staleUpdatedAt);

      const resolved = await prisma.$transaction((tx) =>
        reconcileStaleSendingNotificationDeliveries(tx, STALE_SENDING_THRESHOLD_MS),
      );

      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        id: delivery.id,
        alertEventId: event.id,
        channel: 'EMAIL',
        templateVersion: 3,
      });

      const updated = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      expect(updated.status).toBe('RETRYABLE_FAILURE');
      expect(updated.errorCode).toBe('STALE_SENDING_LEASE');
    });

    // AC-005: duas reconciliações concorrentes sobre a mesma entrega presa
    // produzem exatamente um reenfileiramento (a segunda não encontra mais a
    // linha em SENDING).
    it('never returns the same stuck delivery to two concurrent reconciliation calls', async () => {
      const staleUpdatedAt = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS - 1000);
      const { delivery } = await seedSendingDelivery(staleUpdatedAt);

      const [first, second] = await Promise.all([
        prisma.$transaction((tx) =>
          reconcileStaleSendingNotificationDeliveries(tx, STALE_SENDING_THRESHOLD_MS),
        ),
        prisma.$transaction((tx) =>
          reconcileStaleSendingNotificationDeliveries(tx, STALE_SENDING_THRESHOLD_MS),
        ),
      ]);

      const totalResolved =
        first.filter((row) => row.id === delivery.id).length +
        second.filter((row) => row.id === delivery.id).length;
      expect(totalResolved).toBe(1);
    });
  });
});

describe('findLowPriceReferences (SPEC-039)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const until = new Date('2026-10-14T12:00:00Z');
  const at = (daysAgo: number, hour = 12) => new Date(Date.UTC(2026, 9, 14 - daysAgo, hour, 0, 0));

  it('menor preço por dia na janela, menor da janela longa e a observação atual fora', async () => {
    const { target } = await seedTargetWithWatch();
    await createObservation(target.id, 50_000, at(1, 8));
    await createObservation(target.id, 45_000, at(1, 20)); // mesmo dia: fica o menor
    await createObservation(target.id, 47_000, at(2));
    await createObservation(target.id, 30_000, at(40)); // fora dos 30 dias, dentro dos 90
    await createObservation(target.id, 10_000, at(100)); // fora das duas janelas
    const current = await createObservation(target.id, 20_000, at(0));

    const refs = await findLowPriceReferences(prisma, {
      searchTargetId: target.id,
      currency: 'BRL',
      until,
      excludeObservationId: current.id,
      historyWindowDays: 30,
      lowestWindowDays: 90,
    });

    expect(refs.dailyLows).toEqual([
      { day: '2026-10-12', amountMinor: 47_000 },
      { day: '2026-10-13', amountMinor: 45_000 },
    ]);
    expect(refs.lowestAmountMinor).toBe(30_000);
    expect(until.getTime() - at(40).getTime()).toBeGreaterThan(30 * DAY);
  });

  it('em lote: as mesmas referências por viagem, inclusive vazias', async () => {
    const first = await seedTargetWithWatch();
    const second = await seedTargetWithWatch();
    await createObservation(first.target.id, 50_000, at(1));
    await createObservation(first.target.id, 45_000, at(2));
    await createObservation(first.target.id, 30_000, at(40));

    const refs = await findLowPriceReferencesForTargets(prisma, {
      targets: [
        { id: first.target.id, currency: 'BRL' },
        { id: second.target.id, currency: 'BRL' },
      ],
      until,
      historyWindowDays: 30,
      lowestWindowDays: 90,
    });

    expect(refs.get(first.target.id)).toEqual({
      dailyLows: [
        { day: '2026-10-12', amountMinor: 45_000 },
        { day: '2026-10-13', amountMinor: 50_000 },
      ],
      lowestAmountMinor: 30_000,
    });
    expect(refs.get(second.target.id)).toEqual({ dailyLows: [], lowestAmountMinor: null });
  });

  it('sem observações, não há referência', async () => {
    const { target } = await seedTargetWithWatch();
    const refs = await findLowPriceReferences(prisma, {
      searchTargetId: target.id,
      currency: 'BRL',
      until,
      historyWindowDays: 30,
      lowestWindowDays: 90,
    });
    expect(refs).toEqual({ dailyLows: [], lowestAmountMinor: null });
  });
});

describe('backfillLowPriceRules (SPEC-039)', () => {
  async function seedWithRules(status: 'ACTIVE' | 'PAUSED' | 'CANCELLED') {
    const { watch } = await seedTargetWithWatch();
    await prisma.watch.update({ where: { id: watch.id }, data: { status } });
    await prisma.alertRule.create({
      data: {
        watchId: watch.id,
        type: 'TARGET_PRICE',
        targetAmountMinor: 100,
        cooldownSeconds: 3600,
      },
    });
    return watch;
  }

  async function rulesOf(watchId: string) {
    const rules = await prisma.alertRule.findMany({ where: { watchId } });
    return rules.map((rule) => `${rule.type}:${rule.enabled}`).sort();
  }

  it('ativos e pausados ficam só com LOW_PRICE; regras antigas desativadas, não apagadas', async () => {
    const active = await seedWithRules('ACTIVE');
    const paused = await seedWithRules('PAUSED');
    const cancelled = await seedWithRules('CANCELLED');

    const dry = await backfillLowPriceRules(prisma, { dropPercent: 15, dryRun: true });
    expect(dry.migrated).toBeGreaterThanOrEqual(2);
    expect(await rulesOf(active.id)).not.toContain('LOW_PRICE:true');

    await backfillLowPriceRules(prisma, { dropPercent: 15, batchSize: 1 });

    for (const watch of [active, paused]) {
      expect(await rulesOf(watch.id)).toEqual([
        'LOW_PRICE:true',
        'PERCENTAGE_DROP:false',
        'TARGET_PRICE:false',
      ]);
    }
    expect(await rulesOf(cancelled.id)).toEqual(['PERCENTAGE_DROP:true', 'TARGET_PRICE:true']);

    // Rodar de novo não muda nada.
    const again = await backfillLowPriceRules(prisma, { dropPercent: 15 });
    expect(again.migrated).toBe(0);
    expect(await rulesOf(active.id)).toHaveLength(3);
  });

  it('o modo inverso volta as regras antigas e não deixa Watch novo sem regra', async () => {
    const migrated = await seedWithRules('ACTIVE');
    await backfillLowPriceRules(prisma, { dropPercent: 15 });
    const { watch: fresh } = await seedTargetWithWatch();
    await prisma.alertRule.deleteMany({ where: { watchId: fresh.id } });
    await prisma.alertRule.create({
      data: { watchId: fresh.id, type: 'LOW_PRICE', dropPercent: 15, cooldownSeconds: 43_200 },
    });

    await revertLowPriceRules(prisma);

    expect(await rulesOf(migrated.id)).toEqual([
      'LOW_PRICE:false',
      'PERCENTAGE_DROP:true',
      'TARGET_PRICE:true',
    ]);
    expect(await rulesOf(fresh.id)).toEqual(['LOW_PRICE:true']);
  });
});
