import type {
  AlertRule,
  PrismaClient,
  SearchExecutionStatus,
  SearchTarget,
  Watch,
} from '@prisma/client';

export interface LatestObservation {
  totalAmountMinor: number;
  currency: string;
  // SPEC-018: campos a mais só pra projetar `currentOffer` — não usados pra
  // "preço atual"/"menor preço" em si, que já existiam antes desta spec.
  deeplink: string | null;
  expiresAt: Date | null;
  observedAt: Date;
  providerStrategy: string;
}

export interface WatchListItem {
  watch: Watch;
  searchTarget: SearchTarget;
  alertRules: AlertRule[];
  latestObservation: LatestObservation | null;
  lowestObservation: { totalAmountMinor: number; currency: string } | null;
  latestExecution: { at: Date; status: SearchExecutionStatus } | null;
}

/**
 * PRODUCT.md §7.3: "último preço observado", "menor preço observado durante a
 * vigência do monitoramento", "data/hora da última consulta bem-sucedida",
 * "estado atual". Sem SPEC própria (ver list-watches.ts em packages/contracts).
 *
 * Uma query por Watch para preço mais recente/mais baixo/última execução —
 * aceitável na escala de uma página de conta (dezenas de Watches), não o
 * caminho quente do scheduler/price-worker. Otimizar (batch por
 * searchTargetId único) só quando isso importar de verdade.
 */
type WatchWithRelations = Watch & { searchTarget: SearchTarget; alertRules: AlertRule[] };

async function enrichWatch(
  prisma: PrismaClient,
  watch: WatchWithRelations,
): Promise<WatchListItem> {
  const [latestObservation, lowestObservation, latestExecution] = await Promise.all([
    // Deliberadamente SEM o corte `observedAt >= watch.startsAt` que
    // `lowestObservation`/`priceHistory` (SPEC-009) aplicam: "preço atual" é o
    // preço mais recente do SearchTarget compartilhado (ADR-005), útil mesmo
    // que a última checagem tenha rodado um instante antes deste Watch
    // existir. "Menor preço" e "histórico" respondem "desde que eu monitoro",
    // por isso são cortados por startsAt — são perguntas diferentes, não uma
    // inconsistência (achado de review: assimetria não estava documentada).
    prisma.priceObservation.findFirst({
      where: { searchTargetId: watch.searchTargetId },
      orderBy: { observedAt: 'desc' },
      select: {
        totalAmountMinor: true,
        currency: true,
        deeplink: true,
        expiresAt: true,
        observedAt: true,
        providerStrategy: true,
      },
    }),
    prisma.priceObservation.findFirst({
      where: { searchTargetId: watch.searchTargetId, observedAt: { gte: watch.startsAt } },
      orderBy: { totalAmountMinor: 'asc' },
      select: { totalAmountMinor: true, currency: true },
    }),
    prisma.searchExecution.findFirst({
      // SCHEDULED/RUNNING não têm "outcome" — a última checagem exibida é a
      // última que efetivamente concluiu, não a que está em andamento agora.
      // Ordenar por createdAt (não completedAt) é seguro porque o scheduler
      // nunca cria uma nova SearchExecution pro mesmo searchTargetId enquanto
      // a anterior não chega a um status realmente terminal — SCHEDULED,
      // RUNNING, RETRYABLE_FAILURE e RATE_LIMITED todos bloqueiam reagendamento
      // (packages/database/src/scheduler-repository.ts, cláusula `status IN`
      // da seleção de targets elegíveis). Duas execuções do mesmo target nunca
      // se sobrepõem no tempo, então createdAt DESC e completedAt DESC dão a
      // mesma ordem entre elas (achado de review F-005: cenário de conclusão
      // fora de ordem não é possível dado esse invariante).
      where: {
        searchTargetId: watch.searchTargetId,
        status: { notIn: ['SCHEDULED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { completedAt: true, scheduledAt: true, status: true },
    }),
  ]);

  return {
    watch,
    searchTarget: watch.searchTarget,
    alertRules: watch.alertRules,
    latestObservation,
    lowestObservation,
    latestExecution: latestExecution
      ? {
          at: latestExecution.completedAt ?? latestExecution.scheduledAt,
          status: latestExecution.status,
        }
      : null,
  };
}

export async function listWatchesForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<WatchListItem[]> {
  const watches = await prisma.watch.findMany({
    where: { userId },
    include: { searchTarget: true, alertRules: true },
    orderBy: { createdAt: 'desc' },
  });

  const results: WatchListItem[] = [];
  for (const watch of watches) {
    results.push(await enrichWatch(prisma, watch));
  }
  return results;
}

/**
 * SPEC-008 §6: usado antes/depois de uma transição de ciclo de vida — mesma
 * forma de projeção da listagem, restrita a um único Watch e já filtrada por
 * dono, pra não vazar (nem em erro) se um Watch de outro usuário existe.
 */
export async function getWatchForUser(
  prisma: PrismaClient,
  userId: string,
  watchId: string,
): Promise<WatchListItem | null> {
  const watch = await prisma.watch.findFirst({
    where: { id: watchId, userId },
    include: { searchTarget: true, alertRules: true },
  });
  if (!watch) {
    return null;
  }
  return enrichWatch(prisma, watch);
}

export interface PriceHistoryPoint {
  id: string;
  observedAt: Date;
  totalAmountMinor: number;
  currency: string;
}

export interface WatchDetailItem extends WatchListItem {
  priceHistory: PriceHistoryPoint[];
}

// SPEC-009 §6: teto de engenharia, não requisito de produto — evita resposta
// ilimitada para um Watch antigo com checagem frequente.
const PRICE_HISTORY_LIMIT = 500;

/**
 * SPEC-009 §6: mesmo corte de `observedAt >= watch.startsAt` já usado para
 * "menor preço" em `enrichWatch` — preço observado antes do Watch existir não
 * é história deste monitoramento, mesmo que o SearchTarget seja compartilhado
 * com um Watch mais antigo (ADR-005).
 */
export async function getWatchDetailForUser(
  prisma: PrismaClient,
  userId: string,
  watchId: string,
): Promise<WatchDetailItem | null> {
  const watch = await prisma.watch.findFirst({
    where: { id: watchId, userId },
    include: { searchTarget: true, alertRules: true },
  });
  if (!watch) {
    return null;
  }

  const [item, recentObservations] = await Promise.all([
    enrichWatch(prisma, watch),
    prisma.priceObservation.findMany({
      where: { searchTargetId: watch.searchTargetId, observedAt: { gte: watch.startsAt } },
      // Desempate por `id` quando duas observações têm o mesmo `observedAt`
      // (achado de review F-007: sem isso, a ordem entre empates — e quais
      // delas ficam dentro do teto de 500 — não é determinística).
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: PRICE_HISTORY_LIMIT,
      select: { id: true, observedAt: true, totalAmountMinor: true, currency: true },
    }),
  ]);

  return { ...item, priceHistory: recentObservations.reverse() };
}
