import type { AlertEvent, AlertRule, Prisma, PriceObservation, Watch } from '@prisma/client';

export type WatchForEvaluation = Watch & { alertRules: AlertRule[] };

/**
 * SPEC-005 §6/§8: fan-out paginado por cursor (watch.id) — retomável sem
 * reiniciar do zero se o processamento for interrompido no meio de um target
 * com muitos Watches.
 */
export async function selectActiveWatchesPage(
  tx: Prisma.TransactionClient,
  params: { searchTargetId: string; cursor: string | null; limit: number },
): Promise<WatchForEvaluation[]> {
  return tx.watch.findMany({
    where: {
      searchTargetId: params.searchTargetId,
      status: 'ACTIVE',
      ...(params.cursor ? { id: { gt: params.cursor } } : {}),
    },
    orderBy: { id: 'asc' },
    take: params.limit,
    include: { alertRules: { where: { enabled: true } } },
  });
}

export interface ReferenceObservationParams {
  searchTargetId: string;
  watchStartsAt: Date;
  excludeObservationId: string;
  beforeOrAt?: Date;
}

// SPEC-005 §5: só observações a partir de watch.startsAt participam; a observação
// atual nunca é sua própria referência (DR do domínio).
export async function findPreviousValidObservation(
  tx: Prisma.TransactionClient,
  params: ReferenceObservationParams,
): Promise<PriceObservation | null> {
  return tx.priceObservation.findFirst({
    where: {
      searchTargetId: params.searchTargetId,
      observedAt: {
        gte: params.watchStartsAt,
        ...(params.beforeOrAt ? { lte: params.beforeOrAt } : {}),
      },
      id: { not: params.excludeObservationId },
    },
    orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function findFirstValidObservation(
  tx: Prisma.TransactionClient,
  params: ReferenceObservationParams,
): Promise<PriceObservation | null> {
  return tx.priceObservation.findFirst({
    where: {
      searchTargetId: params.searchTargetId,
      observedAt: { gte: params.watchStartsAt },
      id: { not: params.excludeObservationId },
    },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
  });
}

export async function findLowestValidObservation(
  tx: Prisma.TransactionClient,
  params: ReferenceObservationParams,
): Promise<PriceObservation | null> {
  return tx.priceObservation.findFirst({
    where: {
      searchTargetId: params.searchTargetId,
      observedAt: { gte: params.watchStartsAt },
      id: { not: params.excludeObservationId },
    },
    orderBy: [{ totalAmountMinor: 'asc' }, { observedAt: 'asc' }, { id: 'asc' }],
  });
}

/** SPEC-005 §7: cooldown conta a partir do último AlertEvent enfileirado/notificado da mesma regra. */
export async function findLastQueuedOrNotifiedAlertEvent(
  tx: Prisma.TransactionClient,
  params: { watchId: string; alertRuleId: string },
): Promise<{ createdAt: Date } | null> {
  return tx.alertEvent.findFirst({
    where: {
      watchId: params.watchId,
      alertRuleId: params.alertRuleId,
      status: { in: ['QUEUED', 'NOTIFIED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
}

export interface CreateAlertEventInput {
  watchId: string;
  alertRuleId: string;
  priceObservationId: string;
  triggerType: AlertRule['type'];
  ruleVersion: number;
  referenceAmountMinor: number | null;
  currentAmountMinor: number;
  currency: string;
  deduplicationKey: string;
  status: 'QUEUED' | 'SUPPRESSED';
  suppressionReason: string | null;
  justification: Prisma.InputJsonValue;
}

/**
 * SPEC-005 §8: checa a deduplicationKey ANTES de criar (não via catch depois) —
 * mesma lição da Fase 2/3: um erro de constraint dentro de uma transação em
 * andamento aborta tudo, não só o insert que falhou.
 */
export async function findOrCreateAlertEvent(
  tx: Prisma.TransactionClient,
  input: CreateAlertEventInput,
): Promise<{ event: AlertEvent; created: boolean }> {
  const existing = await tx.alertEvent.findUnique({
    where: { deduplicationKey: input.deduplicationKey },
  });
  if (existing) {
    return { event: existing, created: false };
  }
  const event = await tx.alertEvent.create({ data: input });
  return { event, created: true };
}
