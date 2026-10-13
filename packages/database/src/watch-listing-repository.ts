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
 * Checklist pré-lançamento #2 (H09): a página inteira é enriquecida com uma
 * consulta agregada por informação (LATERAL por Watch, usando o índice de
 * `[searchTargetId, observedAt desc]`), não uma rodada de queries por Watch.
 */
type WatchWithRelations = Watch & { searchTarget: SearchTarget; alertRules: AlertRule[] };

interface WatchEnrichment {
  latestObservation: LatestObservation | null;
  lowestObservation: { totalAmountMinor: number; currency: string } | null;
  latestExecution: { at: Date; status: SearchExecutionStatus } | null;
}

interface LatestRow {
  watchId: string;
  totalAmountMinor: number;
  currency: string;
  deeplink: string | null;
  expiresAt: Date | null;
  observedAt: Date;
  providerStrategy: string;
}
interface LowestRow {
  watchId: string;
  totalAmountMinor: number;
  currency: string;
}
interface ExecutionRow {
  watchId: string;
  at: Date;
  status: SearchExecutionStatus;
}

async function enrichWatches(
  prisma: PrismaClient,
  watches: WatchWithRelations[],
): Promise<WatchListItem[]> {
  if (watches.length === 0) {
    return [];
  }
  const ids = watches.map((watch) => watch.id);

  const [latestRows, lowestRows, executionRows] = await Promise.all([
    // Deliberadamente SEM o corte `observedAt >= watch.startsAt` que
    // `lowestObservation`/`priceHistory` (SPEC-009) aplicam: "preço atual" é o
    // preço mais recente do SearchTarget compartilhado (ADR-005), útil mesmo
    // que a última checagem tenha rodado um instante antes deste Watch
    // existir. "Menor preço" e "histórico" respondem "desde que eu monitoro",
    // por isso são cortados por startsAt — são perguntas diferentes, não uma
    // inconsistência (achado de review: assimetria não estava documentada).
    prisma.$queryRaw<LatestRow[]>`
      SELECT w."id" AS "watchId", o."totalAmountMinor", o."currency", o."deeplink",
             o."expiresAt", o."observedAt", o."providerStrategy"
      FROM "watches" w
      JOIN LATERAL (
        SELECT * FROM "price_observations" p
        WHERE p."searchTargetId" = w."searchTargetId"
        ORDER BY p."observedAt" DESC
        LIMIT 1
      ) o ON true
      WHERE w."id" = ANY(${ids}::text[])`,
    prisma.$queryRaw<LowestRow[]>`
      SELECT w."id" AS "watchId", o."totalAmountMinor", o."currency"
      FROM "watches" w
      JOIN LATERAL (
        SELECT * FROM "price_observations" p
        WHERE p."searchTargetId" = w."searchTargetId" AND p."observedAt" >= w."startsAt"
        ORDER BY p."totalAmountMinor" ASC
        LIMIT 1
      ) o ON true
      WHERE w."id" = ANY(${ids}::text[])`,
    // SCHEDULED/RUNNING não têm "outcome" — a última checagem exibida é a
    // última que efetivamente concluiu, não a que está em andamento agora.
    // Ordenar por createdAt (não completedAt) é seguro porque o scheduler
    // nunca cria uma nova SearchExecution pro mesmo searchTargetId enquanto
    // a anterior não chega a um status realmente terminal — SCHEDULED,
    // RUNNING, RETRYABLE_FAILURE e RATE_LIMITED todos bloqueiam reagendamento
    // (packages/database/src/scheduler-repository.ts, cláusula `status IN`
    // da seleção de targets elegíveis). Duas execuções do mesmo target nunca
    // se sobrepõem no tempo, então createdAt DESC e completedAt DESC dão a
    // mesma ordem entre elas (achado de review F-005).
    prisma.$queryRaw<ExecutionRow[]>`
      SELECT w."id" AS "watchId", COALESCE(e."completedAt", e."scheduledAt") AS "at",
             e."status"
      FROM "watches" w
      JOIN LATERAL (
        SELECT * FROM "search_executions" x
        WHERE x."searchTargetId" = w."searchTargetId"
          AND x."status"::text NOT IN ('SCHEDULED', 'RUNNING')
        ORDER BY x."createdAt" DESC
        LIMIT 1
      ) e ON true
      WHERE w."id" = ANY(${ids}::text[])`,
  ]);

  const latestByWatch = new Map(latestRows.map((row) => [row.watchId, row]));
  const lowestByWatch = new Map(lowestRows.map((row) => [row.watchId, row]));
  const executionByWatch = new Map(executionRows.map((row) => [row.watchId, row]));

  return watches.map((watch): WatchListItem => {
    const latest = latestByWatch.get(watch.id);
    const lowest = lowestByWatch.get(watch.id);
    const execution = executionByWatch.get(watch.id);
    const enrichment: WatchEnrichment = {
      latestObservation: latest
        ? {
            totalAmountMinor: latest.totalAmountMinor,
            currency: latest.currency,
            deeplink: latest.deeplink,
            expiresAt: latest.expiresAt,
            observedAt: latest.observedAt,
            providerStrategy: latest.providerStrategy,
          }
        : null,
      lowestObservation: lowest
        ? { totalAmountMinor: lowest.totalAmountMinor, currency: lowest.currency }
        : null,
      latestExecution: execution ? { at: execution.at, status: execution.status } : null,
    };
    return {
      watch,
      searchTarget: watch.searchTarget,
      alertRules: watch.alertRules,
      ...enrichment,
    };
  });
}

async function enrichWatch(
  prisma: PrismaClient,
  watch: WatchWithRelations,
): Promise<WatchListItem> {
  const [item] = await enrichWatches(prisma, [watch]);
  if (!item) {
    throw new Error('enrichWatches returned no item for a single watch');
  }
  return item;
}

export const WATCH_LIST_DEFAULT_LIMIT = 50;
export const WATCH_LIST_MAX_LIMIT = 100;

export interface WatchListPage {
  items: WatchListItem[];
  /** `null` quando não há mais páginas. Opaco para o chamador. */
  nextCursor: string | null;
}

/** Cursor = id do último Watch da página; a ordem é (createdAt desc, id desc). */
export async function listWatchesForUser(
  prisma: PrismaClient,
  userId: string,
  options: { limit?: number | undefined; cursor?: string | undefined } = {},
): Promise<WatchListPage> {
  const limit = Math.min(
    Math.max(options.limit ?? WATCH_LIST_DEFAULT_LIMIT, 1),
    WATCH_LIST_MAX_LIMIT,
  );
  const rows = await prisma.watch.findMany({
    where: { userId },
    include: { searchTarget: true, alertRules: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: await enrichWatches(prisma, pageRows),
    nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null,
  };
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
