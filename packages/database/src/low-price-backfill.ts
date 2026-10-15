import type { Prisma, PrismaClient } from '@prisma/client';

export interface LowPriceBackfillOptions {
  /** Porcentagem gravada nas regras novas (ALERT_LOW_PRICE_DROP_PERCENT). */
  dropPercent: number;
  /** Watches por lote; cada Watch muda numa transação própria. */
  batchSize?: number;
  /** Só conta o que mudaria, sem escrever. */
  dryRun?: boolean;
}

export interface LowPriceBackfillResult {
  /** Watches que ganharam a regra `LOW_PRICE` (ou ganhariam, em dry-run). */
  migrated: number;
  /** Regras antigas desativadas (não apagadas). */
  disabledRules: number;
}

const COOLDOWN_SECONDS = 43_200;
const MIGRATABLE_STATUSES: Prisma.EnumWatchStatusFilter = { in: ['ACTIVE', 'PAUSED'] };

/**
 * SPEC-039 §"Persistência e migração": Watches ativos e pausados passam a ter
 * só a regra `LOW_PRICE`. As regras antigas ficam `enabled = false` — nunca são
 * apagadas, porque os alertas já enviados apontam para elas. Idempotente
 * (Watch que já tem `LOW_PRICE` é pulado), em lotes por cursor e reiniciável.
 * Watches terminais não mudam. Rodar em produção exige aprovação do owner.
 */
export async function backfillLowPriceRules(
  prisma: PrismaClient,
  options: LowPriceBackfillOptions,
): Promise<LowPriceBackfillResult> {
  const batchSize = options.batchSize ?? 200;
  const result: LowPriceBackfillResult = { migrated: 0, disabledRules: 0 };
  let cursor: string | undefined;

  for (;;) {
    const watches = await prisma.watch.findMany({
      where: {
        status: MIGRATABLE_STATUSES,
        alertRules: { none: { type: 'LOW_PRICE' } },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, alertRules: { where: { enabled: true }, select: { id: true } } },
    });
    if (watches.length === 0) break;

    for (const watch of watches) {
      result.migrated += 1;
      result.disabledRules += watch.alertRules.length;
      if (options.dryRun) continue;
      await prisma.$transaction(async (tx) => {
        // Revalida dentro da transação: outra execução pode ter migrado este Watch.
        const already = await tx.alertRule.count({
          where: { watchId: watch.id, type: 'LOW_PRICE' },
        });
        if (already > 0) return;
        await tx.alertRule.updateMany({
          where: { watchId: watch.id, enabled: true },
          data: { enabled: false },
        });
        await tx.alertRule.create({
          data: {
            watchId: watch.id,
            type: 'LOW_PRICE',
            dropPercent: options.dropPercent,
            cooldownSeconds: COOLDOWN_SECONDS,
          },
        });
      });
    }

    cursor = watches[watches.length - 1]?.id;
    if (watches.length < batchSize) break;
  }
  return result;
}

/**
 * Rollback da SPEC-039: volta as regras antigas dos Watches migrados e
 * desativa a `LOW_PRICE`. Só mexe em Watch que tem regra antiga — um Watch
 * criado já com a SPEC-039 ficaria sem regra nenhuma. Nada é apagado.
 */
export async function revertLowPriceRules(
  prisma: PrismaClient,
  options: { dryRun?: boolean } = {},
): Promise<{ reverted: number }> {
  const watches = await prisma.watch.findMany({
    where: {
      status: MIGRATABLE_STATUSES,
      AND: [
        { alertRules: { some: { type: 'LOW_PRICE', enabled: true } } },
        { alertRules: { some: { type: { not: 'LOW_PRICE' } } } },
      ],
    },
    select: { id: true },
  });
  if (!options.dryRun) {
    for (const watch of watches) {
      await prisma.$transaction([
        prisma.alertRule.updateMany({
          where: { watchId: watch.id, type: { not: 'LOW_PRICE' } },
          data: { enabled: true },
        }),
        prisma.alertRule.updateMany({
          where: { watchId: watch.id, type: 'LOW_PRICE' },
          data: { enabled: false },
        }),
      ]);
    }
  }
  return { reverted: watches.length };
}
