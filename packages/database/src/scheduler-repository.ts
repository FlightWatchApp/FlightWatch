import type { Prisma } from '@prisma/client';

export interface EligibleSearchTargetRow {
  id: string;
  providerStrategy: string;
  checkIntervalSeconds: number;
}

/**
 * SPEC-002 §2/§6: seleciona targets elegíveis com `FOR UPDATE SKIP LOCKED` — cada
 * linha só pode ser vista por uma transação por vez; uma segunda réplica do
 * scheduler rodando em paralelo simplesmente pula linhas já travadas, em vez de
 * esperar ou duplicar. Elegibilidade: ativo, tem Watch ativo, no prazo, viagem
 * ainda no futuro, sem execução ainda não resolvida (SCHEDULED/RUNNING, ou
 * RETRYABLE_FAILURE/RATE_LIMITED — regressão: excluir só SCHEDULED/RUNNING
 * deixava o scheduler recriar uma execução nova pro mesmo target enquanto o
 * BullMQ ainda tinha seu próprio retry daquele job pendente, o `nextCheckAt`
 * nunca é avançado em falha, gerando duas execuções concorrentes pro mesmo
 * preço — packages/queue's RETRYABLE_JOB_OPTIONS já cuida do retry sozinho).
 * Só um status verdadeiramente terminal (SUCCEEDED/NO_OFFERS/PERMANENT_FAILURE)
 * libera o target pra um novo agendamento — ver reconcileExhaustedRetries pra
 * quando o BullMQ desiste e a execução falha fica presa em RETRYABLE_FAILURE/
 * RATE_LIMITED pra sempre.
 *
 * Orçamento operacional (cota/custo) ainda não é checado aqui — não há tabela de
 * cota de provedor nesta fase (só existe com um provedor real, Fase 5).
 */
export async function selectEligibleSearchTargetsForUpdate(
  tx: Prisma.TransactionClient,
  limit: number,
): Promise<EligibleSearchTargetRow[]> {
  return tx.$queryRaw<EligibleSearchTargetRow[]>`
    SELECT id, "providerStrategy", "checkIntervalSeconds"
    FROM search_targets
    WHERE status = 'ACTIVE'
      AND "nextCheckAt" IS NOT NULL
      AND "nextCheckAt" <= now()
      AND "departureDate" >= CURRENT_DATE
      AND EXISTS (
        SELECT 1 FROM watches w
        WHERE w."searchTargetId" = search_targets.id AND w.status = 'ACTIVE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM search_executions se
        WHERE se."searchTargetId" = search_targets.id
          AND se.status IN ('SCHEDULED', 'RUNNING', 'RETRYABLE_FAILURE', 'RATE_LIMITED')
      )
    ORDER BY "nextCheckAt" ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
}

export interface CreateScheduledSearchExecutionInput {
  searchTargetId: string;
  providerStrategy: string;
  idempotencyKey: string;
  correlationId: string;
}

export async function createScheduledSearchExecution(
  tx: Prisma.TransactionClient,
  input: CreateScheduledSearchExecutionInput,
): Promise<{ id: string }> {
  return tx.searchExecution.create({
    data: {
      searchTargetId: input.searchTargetId,
      providerStrategy: input.providerStrategy,
      status: 'SCHEDULED',
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    },
    select: { id: true },
  });
}

/**
 * O job carrega `searchTargetId` + `scheduleWindow`, não o ID da execução
 * (SPEC-002 §3) — o worker resolve a `SearchExecution` pela idempotencyKey, que
 * também é como ele reconhece um job redelivered/duplicado (AC-009 do SPEC-003).
 */
export async function findSearchExecutionByIdempotencyKey(
  tx: Prisma.TransactionClient,
  idempotencyKey: string,
): Promise<{ id: string; status: string; priceObservation: { id: string } | null } | null> {
  return tx.searchExecution.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, priceObservation: { select: { id: true } } },
  });
}

/**
 * SPEC-002 §5 passo 8 / §8: reconcilia execuções abandonadas — travadas em
 * SCHEDULED/RUNNING além do timeout, provavelmente por um worker que morreu sem
 * concluir. Marca como falha retentável para o target voltar a ficar elegível.
 */
/**
 * SPEC-011: zera `leaseToken` na mesma escrita que marca a execução como
 * abandonada — é o fencing em si. Se o worker original não morreu de verdade
 * e volta depois para gravar um resultado, `markSearchExecutionFailed` /
 * `persistPriceObservationSuccess` / `persistNoOffersResult` procuram pelo
 * `leaseToken` antigo (que só ele ainda tem em memória) e não encontram mais
 * nenhuma linha para atualizar — a escrita tardia é rejeitada, não aplicada.
 */
export async function reconcileAbandonedSearchExecutions(
  tx: Prisma.TransactionClient,
  staleBeforeMs: number,
): Promise<number> {
  const staleBefore = new Date(Date.now() - staleBeforeMs);
  const result = await tx.searchExecution.updateMany({
    where: {
      status: { in: ['SCHEDULED', 'RUNNING'] },
      createdAt: { lt: staleBefore },
    },
    data: {
      status: 'RETRYABLE_FAILURE',
      errorCode: 'ABANDONED_LEASE',
      completedAt: new Date(),
      leaseToken: null,
    },
  });
  return result.count;
}

/**
 * RETRYABLE_FAILURE/RATE_LIMITED agora bloqueiam re-agendamento do mesmo
 * target (ver selectEligibleSearchTargetsForUpdate) — de propósito, pra não
 * duplicar o retry que o BullMQ já vai fazer sozinho (packages/queue's
 * RETRYABLE_JOB_OPTIONS: 5 tentativas, backoff exponencial partindo de 2s,
 * ~30s de janela total). Mas se o BullMQ esgotar as tentativas e desistir, a
 * linha ficaria presa nesse status pra sempre, travando o target
 * indefinidamente — sem isso, um target podia parar de ser verificado até o
 * fim do MVP sem nenhum sinal visível do motivo. `staleBeforeMs` deve ter
 * folga generosa sobre a janela do BullMQ.
 */
export async function reconcileExhaustedRetries(
  tx: Prisma.TransactionClient,
  staleBeforeMs: number,
): Promise<number> {
  const staleBefore = new Date(Date.now() - staleBeforeMs);
  const result = await tx.searchExecution.updateMany({
    where: {
      status: { in: ['RETRYABLE_FAILURE', 'RATE_LIMITED'] },
      completedAt: { lt: staleBefore },
    },
    data: { status: 'PERMANENT_FAILURE', errorCode: 'RETRY_EXHAUSTED' },
  });
  return result.count;
}

/**
 * DOMAIN.md §3.2: `expiresAt` é setado na criação do Watch (fim do dia de
 * partida, watches.service.ts) — mas nada aplicava, o status nunca
 * transicionava pra `EXPIRED`: o registro ficava "ACTIVE" pra sempre mesmo
 * muito depois da viagem já ter passado, visível ao usuário (GET /v1/watches)
 * e contando indevidamente pra MAX_ACTIVE_WATCHES_PER_USER. Reconciliado aqui
 * junto dos outros `reconcile*` do tick do scheduler — active/paused ->
 * expired são as duas transições válidas da tabela de DOMAIN.md §3.2.
 */
export async function reconcileExpiredWatches(tx: Prisma.TransactionClient): Promise<number> {
  const result = await tx.watch.updateMany({
    where: {
      status: { in: ['ACTIVE', 'PAUSED'] },
      expiresAt: { not: null, lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

export interface DelayedTargetCountRow {
  priority: string;
  count: bigint;
}

/**
 * SPEC-002 §11: "gauge de targets atrasados por classe". `priority` ainda é
 * um placeholder (@default("STANDARD"), sem lógica de priorização real —
 * schema.prisma) mas o agrupamento já fica pronto pra quando existir mais de
 * uma classe. "Atrasado" = elegível por tempo (nextCheckAt no passado) e não
 * bloqueado por execução em aberto, mesmo critério de
 * selectEligibleSearchTargetsForUpdate sem o `LIMIT`/lock (é só leitura pra
 * métrica, não reivindica nada).
 */
export async function countDelayedSearchTargetsByPriority(
  prisma: Pick<Prisma.TransactionClient, '$queryRaw'>,
): Promise<DelayedTargetCountRow[]> {
  return prisma.$queryRaw<DelayedTargetCountRow[]>`
    SELECT priority, count(*) as count
    FROM search_targets
    WHERE status = 'ACTIVE'
      AND "nextCheckAt" IS NOT NULL
      AND "nextCheckAt" <= now()
      AND "departureDate" >= CURRENT_DATE
      AND EXISTS (
        SELECT 1 FROM watches w
        WHERE w."searchTargetId" = search_targets.id AND w.status = 'ACTIVE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM search_executions se
        WHERE se."searchTargetId" = search_targets.id
          AND se.status IN ('SCHEDULED', 'RUNNING', 'RETRYABLE_FAILURE', 'RATE_LIMITED')
      )
    GROUP BY priority
  `;
}
