import { Prisma, type PrismaClient } from '@flight-watch/database';

export interface OutboxRow {
  id: string;
  eventType: string;
  payload: unknown;
}

export type OutboxEventHandler = (payload: unknown, eventId: string) => Promise<void>;

export interface PublishResult {
  published: number;
  failed: number;
}

/**
 * ADR-003: lê eventos `PENDING` com `FOR UPDATE SKIP LOCKED`, chama o handler
 * registrado para o `eventType` (tipicamente: enfileirar no BullMQ) e só marca
 * `PUBLISHED` se o handler não lançar. Falha no handler deixa o evento `PENDING`
 * — a próxima chamada tenta de novo; não marca `FAILED` cegamente (dead-letter
 * com limite de tentativas fica para quando houver necessidade real).
 *
 * `eventType` sem handler registrado nunca é selecionado: o evento fica
 * `PENDING` até existir um consumidor. `WatchCreated.v1` e `PriceObserved.v1`
 * ainda não têm handler nesta fase — ficam acumulando até a Fase 4.
 */
export async function publishPendingOutboxEvents(
  prisma: PrismaClient,
  handlers: Record<string, OutboxEventHandler>,
  batchSize = 50,
): Promise<PublishResult> {
  const registeredTypes = Object.keys(handlers);
  if (registeredTypes.length === 0) {
    return { published: 0, failed: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, "eventType", payload
      FROM outbox_events
      WHERE status = 'PENDING'
        AND "eventType" IN (${Prisma.join(registeredTypes)})
        AND "availableAt" <= now()
      ORDER BY "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    let published = 0;
    let failed = 0;
    for (const row of rows) {
      const handler = handlers[row.eventType];
      if (!handler) {
        continue;
      }
      try {
        await handler(row.payload, row.id);
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
        published += 1;
      } catch {
        failed += 1;
      }
    }
    return { published, failed };
  });
}
