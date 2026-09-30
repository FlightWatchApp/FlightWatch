import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  PriceObservation,
  SearchExecution,
  SearchExecutionStatus,
  SearchTarget,
} from '@prisma/client';
import { StaleLeaseError } from './concurrency.js';

export type SearchExecutionWithTarget = SearchExecution & { searchTarget: SearchTarget };

// SCHEDULED: primeira tentativa. RETRYABLE_FAILURE/RATE_LIMITED: BullMQ redeliverou
// o job após uma falha temporária — precisa poder ser reivindicada de novo, senão
// o retry configurado na fila (packages/queue) nunca produz uma segunda tentativa
// real (bug corrigido: o guard antigo só aceitava SCHEDULED).
const CLAIMABLE_STATUSES: SearchExecutionStatus[] = [
  'SCHEDULED',
  'RETRYABLE_FAILURE',
  'RATE_LIMITED',
];

/**
 * SPEC-003 §5 passos 2-5: reivindica a execução para processar, de forma
 * atômica — um único `UPDATE ... WHERE status IN (...)` no banco, não um
 * find+update separado. Duas entregas concorrentes do mesmo job (redelivery
 * do BullMQ sobrepondo a tentativa original, ou dois workers) nunca conseguem
 * as duas passar: só a que efetivamente mudou a linha (`count === 1`) segue;
 * a outra recebe `null` e desiste sem reprocessar.
 */
export async function claimSearchExecutionForRunning(
  tx: Prisma.TransactionClient,
  searchExecutionId: string,
): Promise<SearchExecutionWithTarget | null> {
  // SPEC-011: novo lease a cada claim — é o que a reconciliação de abandono
  // zera para revogar a posse do worker original (ver reconcileAbandonedSearchExecutions).
  const leaseToken = randomUUID();
  const claimed = await tx.searchExecution.updateMany({
    where: { id: searchExecutionId, status: { in: CLAIMABLE_STATUSES } },
    data: { status: 'RUNNING', startedAt: new Date(), attempt: { increment: 1 }, leaseToken },
  });
  if (claimed.count === 0) {
    return null;
  }
  return tx.searchExecution.findUnique({
    where: { id: searchExecutionId },
    include: { searchTarget: true },
  });
}

/**
 * SPEC-003 §2/§5 passo 3: "revalidar target e cancelamento" — a checagem de
 * elegibilidade do scheduler (nextCheckAt, status, Watch ativo) é do momento do
 * agendamento; entre agendar e o worker efetivamente rodar (a fila pode acumular
 * atraso), o target pode ter sido cancelado, todas as Watches pausadas, ou a
 * data de partida pode ter passado. Sem essa revalidação, o worker gasta uma
 * chamada de provedor à toa num target que não deveria mais ser consultado.
 */
export async function isSearchTargetStillEligible(
  tx: Prisma.TransactionClient,
  searchTargetId: string,
): Promise<boolean> {
  const target = await tx.searchTarget.findUnique({
    where: { id: searchTargetId },
    select: { status: true, departureDate: true },
  });
  if (!target || target.status !== 'ACTIVE') {
    return false;
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (target.departureDate < today) {
    return false;
  }
  const activeWatchCount = await tx.watch.count({ where: { searchTargetId, status: 'ACTIVE' } });
  return activeWatchCount > 0;
}

export interface MarkSearchExecutionFailedInput {
  searchExecutionId: string;
  leaseToken: string;
  status: 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'RATE_LIMITED';
  errorCode: string;
}

/**
 * SPEC-011: escrita condicional por `id + leaseToken`, não mais um `update`
 * incondicional por id — sem isso, um worker cuja execução foi reconciliada
 * como abandonada (lease zerado) ainda conseguia marcar o resultado depois,
 * possivelmente sobrescrevendo uma execução mais nova.
 */
export async function markSearchExecutionFailed(
  tx: Prisma.TransactionClient,
  input: MarkSearchExecutionFailedInput,
): Promise<void> {
  const result = await tx.searchExecution.updateMany({
    where: { id: input.searchExecutionId, leaseToken: input.leaseToken },
    data: { status: input.status, errorCode: input.errorCode, completedAt: new Date() },
  });
  if (result.count === 0) {
    throw new StaleLeaseError(input.searchExecutionId);
  }
}

export interface PriceObservationInsertInput {
  searchExecutionId: string;
  leaseToken: string;
  searchTargetId: string;
  providerStrategy: string;
  correlationId: string;
  observedAt: Date;
  totalAmountMinor: number;
  currency: string;
  itinerary: Prisma.InputJsonValue;
  offerSignature: string;
  deeplink: string | null;
  expiresAt: Date | null;
  qualityFlags: string[];
  observationKey: string;
  selectionPolicyVersion: number;
  normalizerVersion: number;
  offersReceivedCount: number;
  nextCheckAt: Date;
}

/**
 * SPEC-004 §5: transação de sucesso completa — insere a observação imutável,
 * marca a execução `succeeded`, avança o agendamento do target e grava o evento
 * de outbox, tudo atômico. `observationKey` é checado antes do insert (não
 * depois, via catch) para nunca abortar a transação no meio do caminho — mesma
 * lição do upsert quebrado do SearchTarget na Fase 2.
 */
export async function persistPriceObservationSuccess(
  tx: Prisma.TransactionClient,
  input: PriceObservationInsertInput,
): Promise<{ observation: PriceObservation; created: boolean }> {
  const existing = await tx.priceObservation.findUnique({
    where: { observationKey: input.observationKey },
  });
  if (existing) {
    return { observation: existing, created: false };
  }

  // SPEC-011: checagem de lease ANTES de qualquer escrita — se a execução foi
  // reconciliada como abandonada nesse meio-tempo, nada é persistido (nem a
  // observação, nem o avanço do target, nem o outbox). A execução nova criada
  // depois da reconciliação é quem vai produzir o resultado real.
  const claimed = await tx.searchExecution.updateMany({
    where: { id: input.searchExecutionId, leaseToken: input.leaseToken },
    data: {
      status: 'SUCCEEDED',
      completedAt: new Date(),
      offersCount: input.offersReceivedCount,
      normalizerVersion: input.normalizerVersion,
    },
  });
  if (claimed.count === 0) {
    throw new StaleLeaseError(input.searchExecutionId);
  }

  const observation = await tx.priceObservation.create({
    data: {
      searchExecutionId: input.searchExecutionId,
      searchTargetId: input.searchTargetId,
      providerStrategy: input.providerStrategy,
      observedAt: input.observedAt,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      itinerary: input.itinerary,
      offerSignature: input.offerSignature,
      deeplink: input.deeplink,
      expiresAt: input.expiresAt,
      qualityFlags: input.qualityFlags,
      observationKey: input.observationKey,
      selectionPolicyVersion: input.selectionPolicyVersion,
      normalizerVersion: input.normalizerVersion,
    },
  });

  await tx.searchTarget.update({
    where: { id: input.searchTargetId },
    data: { lastCheckedAt: input.observedAt, nextCheckAt: input.nextCheckAt },
  });

  const outboxPayload: Prisma.InputJsonValue = {
    eventId: randomUUID(),
    searchTargetId: input.searchTargetId,
    priceObservationId: observation.id,
    amountMinor: input.totalAmountMinor,
    currency: input.currency,
    observedAt: input.observedAt.toISOString(),
    selectionPolicyVersion: input.selectionPolicyVersion,
    correlationId: input.correlationId,
  };
  await tx.outboxEvent.create({ data: { eventType: 'PriceObserved.v1', payload: outboxPayload } });

  return { observation, created: true };
}

export interface NoOffersResultInput {
  searchExecutionId: string;
  leaseToken: string;
  searchTargetId: string;
  completedAt: Date;
  nextCheckAt: Date;
  offersReceivedCount: number;
}

/**
 * SPEC-004 §6: marca `no_offers`, avança o agendamento — mas NUNCA cria
 * PriceObservation nem toca na última observação válida existente (DR-005).
 * SPEC-011: escrita condicional por lease, mesmo motivo de markSearchExecutionFailed.
 */
export async function persistNoOffersResult(
  tx: Prisma.TransactionClient,
  input: NoOffersResultInput,
): Promise<void> {
  const claimed = await tx.searchExecution.updateMany({
    where: { id: input.searchExecutionId, leaseToken: input.leaseToken },
    data: {
      status: 'NO_OFFERS',
      completedAt: input.completedAt,
      offersCount: input.offersReceivedCount,
    },
  });
  if (claimed.count === 0) {
    throw new StaleLeaseError(input.searchExecutionId);
  }
  await tx.searchTarget.update({
    where: { id: input.searchTargetId },
    data: { lastCheckedAt: input.completedAt, nextCheckAt: input.nextCheckAt },
  });
}
