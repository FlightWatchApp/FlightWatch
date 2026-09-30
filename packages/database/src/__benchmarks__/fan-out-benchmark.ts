/**
 * EVAL-PERF-002 / EVAL-PERF-004 (flight-watch-foundation-v0.1/EVALS.md).
 *
 * Mede dois padrões de consulta distintos, ambos rotulados "fan-out/N+1" na
 * revisão de SPEC-008/009 (F-004 de WATCH-LIFECYCLE-HISTORY-CODE-REVIEW.md):
 *
 * 1. Avaliação de alerta (apps/alert-worker): quantos Watches presos a UM
 *    SearchTarget compartilhado a paginação por cursor de
 *    `selectActiveWatchesPage` consegue percorrer, e a que custo.
 * 2. Listagem de Watches (GET /v1/watches, apps/api): quantas consultas
 *    `enrichWatch` (3 por Watch, sem paginação) custam pra UM usuário com N
 *    Watches.
 *
 * Rodar: `pnpm --filter @flight-watch/database bench` (precisa de
 * DATABASE_URL apontando pra um Postgres real — docker-compose local serve).
 *
 * Decisão do produto (instrução do usuário, 2026-09-21): se o resultado
 * mostrar problema real, implementar paginação por cursor + carregamento em
 * lote antes de fechar a Fase — Reliability Hardening. Se estiver dentro da
 * meta do MVP, documentar o resultado aqui mesmo e adiar a otimização.
 *
 * RESULTADO (rodado localmente em 2026-09-21, Postgres 16 em container
 * docker-compose local, sem outra carga concorrente):
 *
 *   Fan-out de avaliação de alerta (selectActiveWatchesPage, PAGE_SIZE=200) —
 *   PRIMEIRA rodada, ANTES de qualquer correção:
 *     N=1          9ms |   1 página
 *     N=1.000     75ms |   5 páginas
 *     N=20.000  2.659ms | 100 páginas
 *     N=100.000 29.422ms | 500 páginas   <- problema real: SLO de
 *       ARCHITECTURE.md §13 pra AlertEvent é p95 até 60s; um único job
 *       consumindo ~30s só pra paginar os Watches (antes de sequer avaliar
 *       regra alguma) deixa margem perigosamente curta, e prende um slot de
 *       concorrência do alert-worker por esse tempo todo.
 *
 *   Causa raiz encontrada: `selectActiveWatchesPage` já pagina por cursor
 *   (`WHERE searchTargetId = ? AND status = 'ACTIVE' AND id > cursor ORDER
 *   BY id`), mas o índice existente (`[searchTargetId, status]`) não cobria
 *   `id` — cada página seguinte piorava (varredura/reordenação crescente),
 *   um sintoma clássico de paginação "por cursor" que na prática ainda
 *   degrada como paginação por OFFSET por falta do índice certo. Não era
 *   falta de paginação (já existia desde SPEC-005) nem exigia reescrever a
 *   query — corrigido estendendo o índice pra `[searchTargetId, status, id]`
 *   (migração `20260921194620_watch_fan_out_pagination_index`).
 *
 *   DEPOIS da correção (após `VACUUM ANALYZE` para remover o bloat das
 *   próprias rodadas anteriores do benchmark — sem isso, o resultado fica
 *   artificialmente pior que o esperado em produção, onde autovacuum roda
 *   continuamente):
 *     N=1          8ms |   1 página
 *     N=1.000     79ms |   5 páginas
 *     N=20.000  1.507ms | 100 páginas   (era 2.659ms)
 *     N=100.000 6.183ms | 500 páginas   (era 29.422ms — ~4,8x mais rápido)
 *   Memória: heap delta desprezível/negativo em todos os N — confirma
 *   "memória limitada" (EVAL-PERF-002), a paginação por cursor já descartava
 *   cada página corretamente antes desta correção; só a query em si era lenta.
 *
 *   Listagem de Watches (listWatchesForUser, sem paginação, EVAL-PERF-004):
 *     N=1     25-30ms
 *     N=20    44-51ms   (cenário real de hoje: MAX_ACTIVE_WATCHES_PER_USER=20)
 *     N=100  169-177ms
 *     N=500  841-896ms
 *
 * DECISÃO:
 *   - Fan-out de alerta: HAVIA problema real — corrigido com um índice (baixo
 *     risco, sem reescrever a lógica de paginação, que já existia). 6,2s pra
 *     100.000 Watches num único SearchTarget (cenário extremo) ainda deixa
 *     margem confortável dentro do SLO de 60s; nenhuma paginação/lote
 *     adicional além do que já existe é necessária agora.
 *   - Listagem de Watches: dentro da meta do MVP (p95 de SPEC-001 §14 é
 *     500ms; N=20, o teto real de hoje, fica em ~50ms — larga margem).
 *     Otimização (paginação por cursor + lote nas 3 subconsultas de
 *     enrichWatch) fica adiada, não esquecida: revisitar se/quando
 *     `MAX_ACTIVE_WATCHES_PER_USER` for aumentado para além de ~100-200
 *     (onde a curva começa a se aproximar do orçamento), não antes disso.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../client.js';
import { selectActiveWatchesPage } from '../alert-event-repository.js';
import { listWatchesForUser } from '../watch-listing-repository.js';

const PAGE_SIZE = 200;
const CHUNK_SIZE = 5_000; // limite de parâmetros do Postgres por query — inserir em lotes.

function formatMs(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function seedUserChannelAndTarget(prisma: ReturnType<typeof createPrismaClient>) {
  const user = await prisma.user.create({
    data: {
      email: `bench-${randomUUID()}@example.com`,
      status: 'ACTIVE',
      timezone: 'America/Sao_Paulo',
      passwordHash: 'not-a-real-hash-benchmark-only',
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
      canonicalKey: 'bench-key',
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
  return { user, channel, target };
}

async function bulkCreateWatches(
  prisma: ReturnType<typeof createPrismaClient>,
  params: { userId: string; channelId: string; targetId: string; count: number },
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < params.count; offset += CHUNK_SIZE) {
    const size = Math.min(CHUNK_SIZE, params.count - offset);
    const rows = Array.from({ length: size }, () => ({
      id: randomUUID(),
      userId: params.userId,
      searchTargetId: params.targetId,
      notificationChannelId: params.channelId,
      status: 'ACTIVE' as const,
    }));
    await prisma.watch.createMany({ data: rows });
    ids.push(...rows.map((r) => r.id));
  }
  // Uma AlertRule simples por Watch, pra bater com o formato real que
  // evaluatePriceObservedJob itera (SPEC-005 §6).
  for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + CHUNK_SIZE);
    await prisma.alertRule.createMany({
      data: chunk.map((watchId) => ({
        watchId,
        type: 'TARGET_PRICE' as const,
        targetAmountMinor: 80_000,
        cooldownSeconds: 3600,
      })),
    });
  }
  return ids;
}

async function cleanup(
  prisma: ReturnType<typeof createPrismaClient>,
  ids: { userId: string; targetId: string },
): Promise<void> {
  const watches = await prisma.watch.findMany({
    where: { searchTargetId: ids.targetId },
    select: { id: true },
  });
  const watchIds = watches.map((w) => w.id);
  for (let offset = 0; offset < watchIds.length; offset += CHUNK_SIZE) {
    const chunk = watchIds.slice(offset, offset + CHUNK_SIZE);
    await prisma.alertRule.deleteMany({ where: { watchId: { in: chunk } } });
  }
  await prisma.watch.deleteMany({ where: { searchTargetId: ids.targetId } });
  await prisma.searchTarget.delete({ where: { id: ids.targetId } });
  await prisma.notificationChannel.deleteMany({ where: { userId: ids.userId } });
  await prisma.user.delete({ where: { id: ids.userId } });
}

async function benchmarkAlertFanOut(prisma: ReturnType<typeof createPrismaClient>): Promise<void> {
  console.log('\n=== Fan-out de avaliação de alerta (selectActiveWatchesPage) ===');
  for (const n of [1, 1_000, 20_000, 100_000]) {
    const { user, channel, target } = await seedUserChannelAndTarget(prisma);
    await bulkCreateWatches(prisma, {
      userId: user.id,
      channelId: channel.id,
      targetId: target.id,
      count: n,
    });

    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    let cursor: string | null = null;
    let pages = 0;
    let processed = 0;
    for (;;) {
      const watches = await prisma.$transaction((tx) =>
        selectActiveWatchesPage(tx, { searchTargetId: target.id, cursor, limit: PAGE_SIZE }),
      );
      if (watches.length === 0) break;
      pages += 1;
      processed += watches.length;
      cursor = watches[watches.length - 1]?.id ?? null;
      if (watches.length < PAGE_SIZE) break;
    }
    const ms = performance.now() - start;
    const memDelta = process.memoryUsage().heapUsed - memBefore;

    console.log(
      `N=${n.toString().padStart(7)}: ${formatMs(ms).padStart(8)} | ${pages} páginas | ${processed} Watches processados | heap delta ${formatMb(memDelta)}`,
    );

    await cleanup(prisma, { userId: user.id, targetId: target.id });
  }
}

async function benchmarkWatchListing(prisma: ReturnType<typeof createPrismaClient>): Promise<void> {
  console.log('\n=== Listagem de Watches (listWatchesForUser, N+1 — EVAL-PERF-004) ===');
  for (const n of [1, 20, 100, 500]) {
    const { user, channel, target } = await seedUserChannelAndTarget(prisma);
    await bulkCreateWatches(prisma, {
      userId: user.id,
      channelId: channel.id,
      targetId: target.id,
      count: n,
    });

    const start = performance.now();
    const result = await listWatchesForUser(prisma, user.id);
    const ms = performance.now() - start;

    console.log(
      `N=${n.toString().padStart(4)}: ${formatMs(ms).padStart(8)} | ${result.length} Watches retornados`,
    );

    await cleanup(prisma, { userId: user.id, targetId: target.id });
  }
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await benchmarkAlertFanOut(prisma);
    await benchmarkWatchListing(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
