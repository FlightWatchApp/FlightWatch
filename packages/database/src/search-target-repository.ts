import type { Prisma, SearchTarget } from '@prisma/client';
import { withUniqueConstraintRetry } from './concurrency.js';

export interface SearchTargetCanonicalRecord {
  fingerprint: string;
  canonicalKey: string;
  originIata: string;
  destinationIata: string;
  departureDate: string; // YYYY-MM-DD
  returnDate: string | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  cabin: string;
  adults: number;
  currency: string;
  market: string;
}

export class SearchTargetFingerprintConflictError extends Error {
  constructor(fingerprint: string) {
    super(
      `SearchTarget with fingerprint "${fingerprint}" already exists with different canonical fields`,
    );
    this.name = 'SearchTargetFingerprintConflictError';
  }
}

// Placeholder até a SPEC-002 definir a política real de agendamento (ARCHITECTURE.md §8).
const DEFAULT_CHECK_INTERVAL_SECONDS = 14_400;

function assertCanonicalFieldsMatch(
  existing: SearchTarget,
  record: SearchTargetCanonicalRecord,
): void {
  const existingDepartureDate = existing.departureDate.toISOString().slice(0, 10);
  const existingReturnDate = existing.returnDate
    ? existing.returnDate.toISOString().slice(0, 10)
    : null;

  const matches =
    existing.originIata === record.originIata &&
    existing.destinationIata === record.destinationIata &&
    existingDepartureDate === record.departureDate &&
    existingReturnDate === record.returnDate &&
    existing.tripType === record.tripType &&
    existing.adults === record.adults &&
    existing.currency === record.currency &&
    existing.market === record.market;

  // SPEC-001 §6: colisão teórica de hash com campos divergentes falha em vez de
  // associar ao target errado. SHA-256 torna isso praticamente impossível na prática;
  // esta checagem é a rede de segurança explícita que a spec exige mesmo assim.
  if (!matches) {
    throw new SearchTargetFingerprintConflictError(record.fingerprint);
  }
}

/**
 * Encontra o SearchTarget pelo fingerprint ou cria um novo (ADR-005: "criações
 * concorrentes usam upsert e recuperam o mesmo SearchTarget").
 *
 * Não usa `prisma.upsert()`: com um `update` vazio (não há nada a atualizar quando
 * o target já existe), o Prisma não consegue montar um `ON CONFLICT DO UPDATE SET`
 * nativo e cai num caminho emulado que não é atômico dentro de uma transação
 * interativa — o INSERT que perde a corrida derruba a transação inteira do Postgres
 * (erro que só se resolve com ROLLBACK, nenhum outro comando roda na mesma tx depois
 * disso). Por isso o `create` aqui pode lançar uma violação de unicidade de propósito:
 * quem chama esta função DEVE envolver a transação inteira com
 * `withSearchTargetRaceRetry` para tentar de novo (dessa vez o `findUnique` vai achar
 * a linha que a transação vencedora já commitou).
 */
export async function findOrCreateSearchTarget(
  tx: Prisma.TransactionClient,
  record: SearchTargetCanonicalRecord,
): Promise<SearchTarget> {
  const existing = await tx.searchTarget.findUnique({ where: { fingerprint: record.fingerprint } });
  if (existing) {
    assertCanonicalFieldsMatch(existing, record);
    return existing;
  }

  return tx.searchTarget.create({
    data: {
      fingerprint: record.fingerprint,
      canonicalKey: record.canonicalKey,
      originIata: record.originIata,
      destinationIata: record.destinationIata,
      departureDate: new Date(record.departureDate),
      returnDate: record.returnDate ? new Date(record.returnDate) : null,
      tripType: record.tripType,
      cabin: record.cabin,
      adults: record.adults,
      currency: record.currency,
      market: record.market,
      nextCheckAt: new Date(),
      checkIntervalSeconds: DEFAULT_CHECK_INTERVAL_SECONDS,
    },
  });
}

/**
 * Envolve uma transação que chama `findOrCreateSearchTarget`. Se ela perder a
 * corrida de criação, tenta de novo (até `maxAttempts` vezes) em vez de propagar
 * o erro — a próxima tentativa encontra o SearchTarget que a transação vencedora
 * já commitou. Casca fina sobre `withUniqueConstraintRetry` (packages/database/src/concurrency.ts).
 */
export async function withSearchTargetRaceRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  return withUniqueConstraintRetry(operation, 'fingerprint', maxAttempts);
}
