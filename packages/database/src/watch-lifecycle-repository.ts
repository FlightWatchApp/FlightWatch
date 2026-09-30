import type { Prisma, WatchStatus } from '@prisma/client';

/**
 * SPEC-008 §9: a escrita é sempre `UPDATE ... WHERE status IN (...)`, nunca
 * "ler status, decidir em código, escrever" — evita que duas requisições
 * concorrentes apliquem a mesma transição duas vezes ou movam o Watch por um
 * estado intermediário inválido. `result.count === 0` significa que outra
 * requisição já mudou o status entre a leitura do chamador e esta escrita;
 * cabe ao chamador reler o estado atual.
 */
export async function transitionWatchStatus(
  tx: Prisma.TransactionClient,
  params: {
    watchId: string;
    userId: string;
    fromStatuses: WatchStatus[];
    toStatus: WatchStatus;
  },
): Promise<number> {
  const result = await tx.watch.updateMany({
    where: { id: params.watchId, userId: params.userId, status: { in: params.fromStatuses } },
    data: { status: params.toStatus, version: { increment: 1 } },
  });
  return result.count;
}
