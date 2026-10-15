import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LowPriceReferenceParams {
  searchTargetId: string;
  currency: string;
  /** Instante de referência: as janelas terminam aqui (inclusive). */
  until: Date;
  /** A observação avaliada nunca é a própria referência (SPEC-039). */
  excludeObservationId?: string;
}

export interface LowPriceReferences {
  /** Menor preço de cada dia (UTC) nos últimos `historyWindowDays`, em ordem de dia. */
  dailyLows: { day: string; amountMinor: number }[];
  /** Menor preço nos últimos `lowestWindowDays`; null sem observação. */
  lowestAmountMinor: number | null;
}

/**
 * SPEC-039: referências do alerta de preço baixo para uma viagem
 * (`SearchTarget`), compartilhadas por todos os Watches dela — uma consulta
 * por observação, não por Watch (H09). Usa o índice
 * `(searchTargetId, observedAt DESC)`.
 */
export async function findLowPriceReferences(
  db: Db,
  params: LowPriceReferenceParams & { historyWindowDays: number; lowestWindowDays: number },
): Promise<LowPriceReferences> {
  const exclude = params.excludeObservationId ?? '';
  const historyFrom = new Date(params.until.getTime() - params.historyWindowDays * DAY_MS);
  const lowestFrom = new Date(params.until.getTime() - params.lowestWindowDays * DAY_MS);

  const daily = await db.$queryRaw<{ day: string; amountMinor: number }[]>`
    SELECT to_char(date_trunc('day', "observedAt"), 'YYYY-MM-DD') AS day,
           MIN("totalAmountMinor")::int AS "amountMinor"
      FROM price_observations
     WHERE "searchTargetId" = ${params.searchTargetId}
       AND currency = ${params.currency}
       AND "observedAt" > ${historyFrom}
       AND "observedAt" <= ${params.until}
       AND id <> ${exclude}
     GROUP BY 1
     ORDER BY 1`;

  const lowest = await db.priceObservation.findFirst({
    where: {
      searchTargetId: params.searchTargetId,
      currency: params.currency,
      observedAt: { gt: lowestFrom, lte: params.until },
      ...(params.excludeObservationId ? { id: { not: params.excludeObservationId } } : {}),
    },
    orderBy: [{ totalAmountMinor: 'asc' }, { observedAt: 'asc' }],
    select: { totalAmountMinor: true },
  });

  return { dailyLows: daily, lowestAmountMinor: lowest?.totalAmountMinor ?? null };
}

/**
 * SPEC-039: as mesmas referências para várias viagens de uma vez (listagem de
 * Watches da API) — duas consultas no total, não duas por Watch.
 */
export async function findLowPriceReferencesForTargets(
  db: Db,
  params: {
    targets: readonly { id: string; currency: string }[];
    until: Date;
    historyWindowDays: number;
    lowestWindowDays: number;
  },
): Promise<Map<string, LowPriceReferences>> {
  const result = new Map<string, LowPriceReferences>();
  for (const target of params.targets) {
    result.set(target.id, { dailyLows: [], lowestAmountMinor: null });
  }
  if (params.targets.length === 0) return result;

  const ids = Prisma.join([...new Set(params.targets.map((target) => target.id))]);
  const currencyOf = new Map(params.targets.map((target) => [target.id, target.currency]));
  const historyFrom = new Date(params.until.getTime() - params.historyWindowDays * DAY_MS);
  const lowestFrom = new Date(params.until.getTime() - params.lowestWindowDays * DAY_MS);

  const daily = await db.$queryRaw<
    { searchTargetId: string; currency: string; day: string; amountMinor: number }[]
  >`
    SELECT "searchTargetId", currency,
           to_char(date_trunc('day', "observedAt"), 'YYYY-MM-DD') AS day,
           MIN("totalAmountMinor")::int AS "amountMinor"
      FROM price_observations
     WHERE "searchTargetId" IN (${ids})
       AND "observedAt" > ${historyFrom}
       AND "observedAt" <= ${params.until}
     GROUP BY 1, 2, 3
     ORDER BY 1, 3`;
  for (const row of daily) {
    if (currencyOf.get(row.searchTargetId) !== row.currency) continue;
    result.get(row.searchTargetId)?.dailyLows.push({ day: row.day, amountMinor: row.amountMinor });
  }

  const lowest = await db.$queryRaw<
    { searchTargetId: string; currency: string; amountMinor: number }[]
  >`
    SELECT "searchTargetId", currency, MIN("totalAmountMinor")::int AS "amountMinor"
      FROM price_observations
     WHERE "searchTargetId" IN (${ids})
       AND "observedAt" > ${lowestFrom}
       AND "observedAt" <= ${params.until}
     GROUP BY 1, 2`;
  for (const row of lowest) {
    const references = result.get(row.searchTargetId);
    if (references && currencyOf.get(row.searchTargetId) === row.currency) {
      references.lowestAmountMinor = row.amountMinor;
    }
  }
  return result;
}
