import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import type { AlertRule, PriceObservation, Prisma, PrismaClient } from '@flight-watch/database';
import {
  findFirstValidObservation,
  findLastQueuedOrNotifiedAlertEvent,
  findLowestValidObservation,
  findOrCreateAlertEvent,
  findLowPriceReferences,
  findPreviousValidObservation,
  selectActiveWatchesPage,
  withUniqueConstraintRetry,
  type LowPriceReferences,
  type WatchForEvaluation,
} from '@flight-watch/database';
import {
  LOW_PRICE_HISTORY_WINDOW_DAYS,
  LOW_PRICE_LOWEST_WINDOW_DAYS,
  computeAlertEventDeduplicationKey,
  createMoney,
  evaluateAbsoluteDropRule,
  evaluateLowPriceRule,
  evaluateNewObservedLowRule,
  evaluatePercentageDropRule,
  evaluateTargetPriceRule,
  lowPriceDropPercentIsValid,
  resolveTypicalPrice,
  type Money,
} from '@flight-watch/domain';
import type { PriceObservedJob } from '@flight-watch/queue';
import type { AlertWorkerMetrics } from './metrics.js';

const PAGE_SIZE = 200;
// Mesmo valor de ALERT_EMAIL_TEMPLATE_VERSION em packages/notifications. Não
// importamos o pacote aqui só por essa constante (alert-worker não sabe nada de
// e-mail/template, isso é notification-worker) — duplicar um inteiro versionado
// é mais barato que criar acoplamento entre Alerting e Notifications.
const NOTIFICATION_TEMPLATE_VERSION = 1;

export interface AlertWorkerDeps {
  prisma: PrismaClient;
  metrics: AlertWorkerMetrics;
}

/**
 * SPEC-005 §6: para cada Watch ativo ligado ao SearchTarget da observação,
 * avalia as regras habilitadas e cria AlertEvents idempotentes. Fan-out
 * paginado por cursor (watch.id) — retomável, nunca carrega todos os Watches
 * de um target de uma vez (EVAL-PERF-002).
 */
export async function evaluatePriceObservedJob(
  deps: AlertWorkerDeps,
  job: Job<PriceObservedJob>,
): Promise<void> {
  const { prisma, metrics } = deps;
  const data = job.data;

  const observation = await prisma.priceObservation.findUnique({
    where: { id: data.priceObservationId },
  });
  if (!observation) {
    return; // observação inexistente — nada a avaliar.
  }

  // SPEC-039: referências do preço baixo são da viagem, não do Watch — uma
  // consulta por observação, só se algum Watch tiver a regra (H09).
  let lowPriceReferences: Promise<LowPriceReferences> | null = null;
  const loadLowPriceReferences = (): Promise<LowPriceReferences> => {
    lowPriceReferences ??= findLowPriceReferences(prisma, {
      searchTargetId: data.searchTargetId,
      currency: observation.currency,
      until: observation.observedAt,
      excludeObservationId: observation.id,
      historyWindowDays: LOW_PRICE_HISTORY_WINDOW_DAYS,
      lowestWindowDays: LOW_PRICE_LOWEST_WINDOW_DAYS,
    });
    return lowPriceReferences;
  };

  let cursor: string | null = null;
  for (;;) {
    const watches: WatchForEvaluation[] = await prisma.$transaction((tx) =>
      selectActiveWatchesPage(tx, {
        searchTargetId: data.searchTargetId,
        cursor,
        limit: PAGE_SIZE,
      }),
    );
    if (watches.length === 0) {
      break;
    }
    // Conta páginas que realmente continham Watches. A consulta vazia de
    // sentinela necessária quando o total é múltiplo de PAGE_SIZE não é uma
    // página processada.
    metrics.pagesProcessedTotal.inc();

    for (const watch of watches) {
      for (const rule of watch.alertRules) {
        if (rule.type === 'LOW_PRICE') {
          await evaluateLowPrice(
            prisma,
            metrics,
            watch,
            rule,
            observation,
            await loadLowPriceReferences(),
            data.correlationId,
          );
          continue;
        }
        await evaluateRule(prisma, metrics, watch, rule, observation, data.correlationId);
      }
    }

    const lastWatch = watches[watches.length - 1];
    cursor = lastWatch ? lastWatch.id : null;
    if (watches.length < PAGE_SIZE) {
      break;
    }
  }
}

async function resolveReference(
  prisma: PrismaClient,
  watch: WatchForEvaluation,
  rule: AlertRule,
  observation: PriceObservation,
): Promise<PriceObservation | null> {
  if (rule.referenceStrategy === null) {
    return null;
  }
  const params = {
    searchTargetId: watch.searchTargetId,
    watchStartsAt: watch.startsAt,
    excludeObservationId: observation.id,
  };
  switch (rule.referenceStrategy) {
    case 'PREVIOUS_VALID_OBSERVATION':
      return prisma.$transaction((tx) =>
        findPreviousValidObservation(tx, { ...params, beforeOrAt: observation.observedAt }),
      );
    case 'FIRST_VALID_OBSERVATION':
      return prisma.$transaction((tx) => findFirstValidObservation(tx, params));
    case 'LOWEST_VALID_OBSERVATION':
      return prisma.$transaction((tx) => findLowestValidObservation(tx, params));
  }
}

async function isCooldownActive(
  tx: Prisma.TransactionClient,
  watchId: string,
  alertRuleId: string,
  cooldownSeconds: number,
): Promise<boolean> {
  const last = await findLastQueuedOrNotifiedAlertEvent(tx, { watchId, alertRuleId });
  if (!last) {
    return false;
  }
  return Date.now() - last.createdAt.getTime() < cooldownSeconds * 1000;
}

interface RuleEvaluationResult {
  triggered: boolean;
  computed: Record<string, unknown>;
  /** SPEC-005 §14: distingue "avaliou e não disparou" de "sem observação de referência pra avaliar de verdade". */
  noReference?: true;
}

function evaluateRuleFormula(
  rule: AlertRule,
  currentAmountMinor: number,
  currency: string,
  referenceObservation: PriceObservation | null,
): RuleEvaluationResult | null {
  const currentAmount = createMoney(currentAmountMinor, currency);

  switch (rule.type) {
    case 'TARGET_PRICE': {
      if (rule.targetAmountMinor === null) {
        return null; // regra malformada — sem alvo persistido, nada a decidir.
      }
      const result = evaluateTargetPriceRule({
        currentAmount,
        targetAmount: createMoney(rule.targetAmountMinor, currency),
      });
      return {
        triggered: result.triggered,
        computed: { targetAmountMinor: rule.targetAmountMinor },
      };
    }
    case 'PERCENTAGE_DROP': {
      if (!referenceObservation || rule.dropPercent === null) {
        // SPEC-005 §11: sem referência, não dispara.
        return {
          triggered: false,
          computed: {},
          ...(referenceObservation ? {} : { noReference: true }),
        };
      }
      const result = evaluatePercentageDropRule({
        currentAmount,
        referenceAmount: createMoney(
          referenceObservation.totalAmountMinor,
          referenceObservation.currency,
        ),
        configuredPercent: rule.dropPercent,
      });
      return {
        triggered: result.triggered,
        computed: { dropPercent: result.dropPercent, configuredPercent: rule.dropPercent },
      };
    }
    case 'ABSOLUTE_DROP': {
      if (!referenceObservation || rule.dropAmountMinor === null) {
        return {
          triggered: false,
          computed: {},
          ...(referenceObservation ? {} : { noReference: true }),
        };
      }
      const result = evaluateAbsoluteDropRule({
        currentAmount,
        referenceAmount: createMoney(
          referenceObservation.totalAmountMinor,
          referenceObservation.currency,
        ),
        configuredDropAmount: createMoney(rule.dropAmountMinor, currency),
      });
      return {
        triggered: result.triggered,
        computed: {
          dropAmountMinor: result.dropAmountMinor,
          configuredDropAmountMinor: rule.dropAmountMinor,
        },
      };
    }
    case 'NEW_OBSERVED_LOW': {
      const result = evaluateNewObservedLowRule({
        currentAmount,
        minimumValidAmountSinceActivation: referenceObservation
          ? createMoney(referenceObservation.totalAmountMinor, referenceObservation.currency)
          : null,
      });
      return { triggered: result.triggered, computed: {} };
    }
    case 'LOW_PRICE':
      return null; // SPEC-039: avaliada por evaluateLowPrice, com referências da viagem.
  }
}

async function evaluateRule(
  prisma: PrismaClient,
  metrics: AlertWorkerMetrics,
  watch: WatchForEvaluation,
  rule: AlertRule,
  observation: PriceObservation,
  correlationId: string,
): Promise<void> {
  const referenceObservation = await resolveReference(prisma, watch, rule, observation);
  const evaluation = evaluateRuleFormula(
    rule,
    observation.totalAmountMinor,
    observation.currency,
    referenceObservation,
  );
  const ruleResult = !evaluation
    ? 'not_triggered'
    : evaluation.triggered
      ? 'triggered'
      : evaluation.noReference
        ? 'no_reference'
        : 'not_triggered';
  metrics.rulesEvaluatedTotal.inc({ type: rule.type, result: ruleResult });

  if (!evaluation || !evaluation.triggered) {
    return;
  }

  const justification: Prisma.InputJsonValue = {
    ...evaluation.computed,
    referenceStrategy: rule.referenceStrategy,
    referenceObservationId: referenceObservation?.id ?? null,
  };
  await persistAlertEvent(prisma, metrics, {
    watch,
    rule,
    observation,
    referenceAmountMinor: referenceObservation?.totalAmountMinor ?? null,
    justification,
    correlationId,
  });
}

interface PersistAlertEventInput {
  watch: WatchForEvaluation;
  rule: AlertRule;
  observation: PriceObservation;
  referenceAmountMinor: number | null;
  justification: Prisma.InputJsonValue;
  correlationId: string;
  /**
   * SPEC-039: decisão final dentro da transação, com a regra travada (ex.: "só
   * cai mais" lê o último alerta). Não roda em replay de um evento que já existe.
   */
  recheck?: (tx: Prisma.TransactionClient) => Promise<boolean>;
}

type PersistOutcome =
  'queued' | 'suppressed' | 'idempotent_replay' | 'watch_skipped' | 'rechecked_out';

async function persistAlertEvent(
  prisma: PrismaClient,
  metrics: AlertWorkerMetrics,
  input: PersistAlertEventInput,
): Promise<PersistOutcome> {
  const { watch, rule, observation, correlationId, justification } = input;
  const observedAt = observation.observedAt;
  const deduplicationKey = computeAlertEventDeduplicationKey({
    watchId: watch.id,
    alertRuleId: rule.id,
    priceObservationId: observation.id,
    ruleVersion: rule.ruleVersion,
  });

  // findOrCreateAlertEvent pode perder uma corrida sob avaliação concorrente do
  // mesmo PriceObserved (redelivery do job sobreposto ao original) — envolve
  // com retry (packages/database/src/concurrency.ts), mesma lição do
  // SearchTarget/PriceObservation.
  const result = await withUniqueConstraintRetry(
    () =>
      prisma.$transaction(async (tx) => {
        // Trava a linha da AlertRule ANTES de checar o cooldown — regressão:
        // isCooldownActive lia fora (antes) desta transação; duas observações
        // DIFERENTES da mesma regra avaliadas ao mesmo tempo liam "cooldown
        // inativo" antes de qualquer uma commitar e as duas disparavam, que é
        // exatamente o que o cooldown deveria impedir (deduplicationKey não
        // ajuda aqui — observações diferentes geram chaves diferentes, não é
        // uma corrida de redelivery do mesmo job). A trava serializa
        // avaliações concorrentes da MESMA regra: a segunda só prossegue
        // depois que a primeira commitar, e então já vê o AlertEvent recém
        // criado no cooldown check.
        await tx.$queryRaw`SELECT id FROM alert_rules WHERE id = ${rule.id} FOR UPDATE`;

        // Revalida o status do Watch dentro da MESMA transação que cria o
        // AlertEvent — reduz (não elimina) a janela entre a página lida e este
        // ponto em que o Watch poderia ter sido pausado (SPEC-005 AC-005).
        const currentWatch = await tx.watch.findUnique({
          where: { id: watch.id },
          select: { status: true },
        });
        if (currentWatch?.status !== 'ACTIVE') {
          return { outcome: 'watch_skipped' as const, eventCreatedAt: null };
        }

        if (input.recheck) {
          const existing = await tx.alertEvent.findUnique({
            where: { deduplicationKey },
            select: { id: true },
          });
          if (!existing && !(await input.recheck(tx))) {
            return { outcome: 'rechecked_out' as const, eventCreatedAt: null };
          }
        }

        const cooldownActive = await isCooldownActive(tx, watch.id, rule.id, rule.cooldownSeconds);

        const outcome = await findOrCreateAlertEvent(tx, {
          watchId: watch.id,
          alertRuleId: rule.id,
          priceObservationId: observation.id,
          triggerType: rule.type,
          ruleVersion: rule.ruleVersion,
          referenceAmountMinor: input.referenceAmountMinor,
          currentAmountMinor: observation.totalAmountMinor,
          currency: observation.currency,
          deduplicationKey,
          status: cooldownActive ? 'SUPPRESSED' : 'QUEUED',
          suppressionReason: cooldownActive ? 'COOLDOWN_ACTIVE' : null,
          justification,
        });

        if (outcome.created && outcome.event.status === 'QUEUED') {
          const outboxPayload: Prisma.InputJsonValue = {
            eventId: randomUUID(),
            alertEventId: outcome.event.id,
            channel: 'EMAIL',
            templateVersion: NOTIFICATION_TEMPLATE_VERSION,
            correlationId,
          };
          await tx.outboxEvent.create({
            data: { eventType: 'NotificationRequested.v1', payload: outboxPayload },
          });
        }

        if (!outcome.created) {
          return { outcome: 'idempotent_replay' as const, eventCreatedAt: null };
        }
        return {
          outcome:
            outcome.event.status === 'QUEUED' ? ('queued' as const) : ('suppressed' as const),
          eventCreatedAt: outcome.event.createdAt,
        };
      }),
    'deduplicationKey',
  );

  if (result.outcome === 'watch_skipped') {
    metrics.watchSkippedTotal.inc({ reason: 'not_active' });
    return result.outcome;
  }
  if (result.outcome === 'rechecked_out') {
    return result.outcome;
  }
  metrics.eventsTotal.inc({ outcome: result.outcome });
  if (result.outcome !== 'idempotent_replay' && result.eventCreatedAt) {
    const lagSeconds = Math.max(0, (result.eventCreatedAt.getTime() - observedAt.getTime()) / 1000);
    metrics.eventLagSeconds.observe(lagSeconds);
  }
  return result.outcome;
}

/**
 * SPEC-039: preço `dropPercent`% abaixo do normal ou abaixo do menor já
 * observado da viagem. A decisão prévia (sem o último alerta) evita abrir
 * transação à toa; a final, com a regra travada, aplica o "só cai mais".
 */
async function evaluateLowPrice(
  prisma: PrismaClient,
  metrics: AlertWorkerMetrics,
  watch: WatchForEvaluation,
  rule: AlertRule,
  observation: PriceObservation,
  references: LowPriceReferences,
  correlationId: string,
): Promise<void> {
  const dropPercent = rule.dropPercent;
  if (dropPercent === null || !lowPriceDropPercentIsValid(dropPercent)) {
    metrics.rulesEvaluatedTotal.inc({ type: rule.type, result: 'not_triggered' });
    return; // regra malformada — sem porcentagem válida, nada a decidir.
  }
  const currency = observation.currency;
  const money = (amountMinor: number): Money => createMoney(amountMinor, currency);
  const typical = resolveTypicalPrice({
    dailyLows: references.dailyLows,
    baselineAmountMinor: rule.baselineAmountMinor,
  });
  metrics.lowPriceReferenceTotal.inc({
    source: typical ? (typical.source === 'HISTORY' ? 'history' : 'nearby_dates') : 'none',
  });

  const input = {
    currentAmount: money(observation.totalAmountMinor),
    typicalAmount: typical ? money(typical.amountMinor) : null,
    lowestAmount:
      references.lowestAmountMinor !== null ? money(references.lowestAmountMinor) : null,
    dropPercent,
  };
  const preliminary = evaluateLowPriceRule({ ...input, lastAlertAmount: null });
  if (!preliminary.triggered) {
    metrics.rulesEvaluatedTotal.inc({
      type: rule.type,
      result: preliminary.noReference ? 'no_reference' : 'not_triggered',
    });
    return;
  }

  const justification: Prisma.InputJsonValue = {
    reasons: preliminary.reasons,
    dropPercent,
    typicalAmountMinor: typical?.amountMinor ?? null,
    typicalSource: typical?.source ?? null,
    historyDays: typical?.historyDays ?? references.dailyLows.length,
    lowestAmountMinor: references.lowestAmountMinor,
    thresholdAmountMinor: preliminary.thresholdAmountMinor,
  };

  const outcome = await persistAlertEvent(prisma, metrics, {
    watch,
    rule,
    observation,
    referenceAmountMinor: typical?.amountMinor ?? references.lowestAmountMinor,
    justification,
    correlationId,
    recheck: async (tx) => {
      const last = await findLastQueuedOrNotifiedAlertEvent(tx, {
        watchId: watch.id,
        alertRuleId: rule.id,
      });
      const lastAlertAmount =
        last && last.currency === currency ? money(last.currentAmountMinor) : null;
      return evaluateLowPriceRule({ ...input, lastAlertAmount }).triggered;
    },
  });

  metrics.rulesEvaluatedTotal.inc({
    type: rule.type,
    result: outcome === 'rechecked_out' ? 'not_triggered' : 'triggered',
  });
  if (outcome === 'queued' || outcome === 'suppressed') {
    const [first, second] = preliminary.reasons;
    metrics.lowPriceReasonTotal.inc({
      reason: second ? 'both' : first === 'BELOW_TYPICAL' ? 'below_typical' : 'lowest_observed',
    });
  }
}
