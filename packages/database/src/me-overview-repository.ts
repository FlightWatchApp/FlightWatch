import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

/** SPEC-040: alertas que chegaram à pessoa (`NOTIFIED`), de todos os Watches dela. */
export function countNotifiedAlertsForUser(db: Db, userId: string): Promise<number> {
  return db.alertEvent.count({ where: { status: 'NOTIFIED', watch: { userId } } });
}

export interface BiggestLowPriceDrop {
  /** Preço normal − preço do alerta, em unidade mínima. */
  amountMinor: number;
  typicalAmountMinor: number;
  currentAmountMinor: number;
  currency: string;
  originIata: string;
  destinationIata: string;
  departureDate: string;
}

/**
 * SPEC-040: a maior distância entre o preço normal e o preço avisado, entre os
 * alertas de preço baixo enviados (SPEC-039 grava o preço normal na
 * justificativa). É "abaixo do normal", nunca economia realizada.
 */
export async function findBiggestLowPriceDrop(
  db: Db,
  userId: string,
): Promise<BiggestLowPriceDrop | null> {
  const rows = await db.$queryRaw<
    {
      typical: number;
      current: number;
      currency: string;
      originIata: string;
      destinationIata: string;
      departureDate: Date;
    }[]
  >`
    SELECT (ae.justification->>'typicalAmountMinor')::int AS typical,
           ae."currentAmountMinor" AS current,
           ae.currency,
           st."originIata", st."destinationIata", st."departureDate"
      FROM alert_events ae
      JOIN watches w ON w.id = ae."watchId"
      JOIN search_targets st ON st.id = w."searchTargetId"
     WHERE w."userId" = ${userId}
       AND ae.status = 'NOTIFIED'
       AND ae."triggerType" = 'LOW_PRICE'
       AND jsonb_typeof(ae.justification->'typicalAmountMinor') = 'number'
       AND (ae.justification->>'typicalAmountMinor')::int > ae."currentAmountMinor"
     ORDER BY (ae.justification->>'typicalAmountMinor')::int - ae."currentAmountMinor" DESC
     LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    amountMinor: row.typical - row.current,
    typicalAmountMinor: row.typical,
    currentAmountMinor: row.current,
    currency: row.currency,
    originIata: row.originIata,
    destinationIata: row.destinationIata,
    departureDate: row.departureDate.toISOString().slice(0, 10),
  };
}

/**
 * SPEC-040: destinos da pessoa — os dos Watches ativos ou pausados e os
 * encerrados nos últimos 90 dias. Regra fixa, sem inferência.
 */
export async function findUserDestinations(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const watches = await db.watch.findMany({
    where: {
      userId,
      OR: [{ status: { in: ['ACTIVE', 'PAUSED'] } }, { updatedAt: { gte: since } }],
    },
    select: { searchTarget: { select: { destinationIata: true } } },
  });
  return [...new Set(watches.map((watch) => watch.searchTarget.destinationIata))];
}
