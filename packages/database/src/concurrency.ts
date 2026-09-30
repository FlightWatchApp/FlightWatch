import { Prisma } from '@prisma/client';

/**
 * SPEC-011: escrita terminal condicional por `id + leaseToken` afetou 0 linhas
 * — a execução já não pertence mais a quem tentou escrever (reconciliada como
 * abandonada enquanto o worker original ainda estava processando). O chamador
 * deve tratar como caminho terminal benigno, não relançar para retry.
 */
export class StaleLeaseError extends Error {
  constructor(readonly searchExecutionId: string) {
    super(`search execution ${searchExecutionId} lease is no longer valid`);
    this.name = 'StaleLeaseError';
  }
}

/**
 * Checa se um erro é uma violação de constraint única do Postgres, opcionalmente
 * restrita a um campo específico (ex.: 'observationKey', 'deduplicationKey').
 */
export function isUniqueConstraintViolation(error: unknown, constraintFieldHint?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (!constraintFieldHint) {
    return true;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) && target.includes(constraintFieldHint);
}

/**
 * Envolve um padrão "achar ou criar" (find-then-create) que pode perder uma
 * corrida: dois chamadores concorrentes veem "não existe" e ambos tentam criar;
 * um vence, o outro recebe uma violação de unicidade que aborta a transação
 * inteira (Postgres não permite mais nenhum comando numa transação já abortada).
 * Retry aqui tenta a operação de novo — na segunda vez, o `findFirst` do padrão
 * encontra a linha que o vencedor já commitou.
 *
 * Usado em toda função `findOrCreateX` deste pacote (SearchTarget, AlertEvent,
 * NotificationDelivery, PriceObservation) — nenhuma delas é seguro de chamar
 * sob concorrência real sem isso.
 */
export async function withUniqueConstraintRetry<T>(
  operation: () => Promise<T>,
  constraintFieldHint?: string,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isUniqueConstraintViolation(error, constraintFieldHint)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}
