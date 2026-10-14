import type { AirlineRecord } from '@flight-watch/domain';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const UPSERT_BATCH_SIZE = 500;

/**
 * SPEC-038: grava o catálogo de companhias (upsert em lote). Companhia que
 * sumiu da fonte fica como está — a página só usa o nome.
 */
export async function syncAirlinesCatalog(
  prisma: PrismaClient,
  records: readonly AirlineRecord[],
  syncedAt: Date,
): Promise<{ upserted: number }> {
  const unique = [...new Map(records.map((record) => [record.code, record])).values()];
  await prisma.$transaction(async (tx) => {
    for (let start = 0; start < unique.length; start += UPSERT_BATCH_SIZE) {
      const batch = unique.slice(start, start + UPSERT_BATCH_SIZE);
      await tx.$executeRaw`
        INSERT INTO "airlines" ("code", "name", "syncedAt")
        SELECT u.code, u.name, ${syncedAt}
        FROM unnest(${batch.map((r) => r.code)}::text[], ${batch.map((r) => r.name)}::text[])
          AS u(code, name)
        ON CONFLICT ("code") DO UPDATE SET
          "name" = EXCLUDED."name",
          "syncedAt" = EXCLUDED."syncedAt"`;
    }
  });
  return { upserted: unique.length };
}

export async function getAirlinesLastSyncedAt(db: Db): Promise<Date | null> {
  const latest = await db.airline.aggregate({ _max: { syncedAt: true } });
  return latest._max.syncedAt;
}

/** Nome por código; código fora do catálogo não aparece no mapa. */
export async function findAirlineNames(
  db: Db,
  codes: readonly string[],
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const airlines = await db.airline.findMany({
    where: { code: { in: [...new Set(codes)] } },
    select: { code: true, name: true },
  });
  return new Map(airlines.map((airline) => [airline.code, airline.name]));
}
