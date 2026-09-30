import type { PrismaClient, SearchTarget } from '@prisma/client';

// SPEC-015 §"Comportamento de domínio": teto de engenharia sobre quantos
// SearchTargets um pedido de GET /v1/opportunities varre, não um requisito
// de produto — mesmo espírito de PRICE_HISTORY_LIMIT
// (packages/database/src/watch-listing-repository.ts).
const OPPORTUNITIES_SCAN_LIMIT_DEFAULT = 200;

// Mesmo valor de MIN_OBSERVATIONS_FOR_REFERENCE em
// packages/domain/src/deal/deal-classification.ts — duplicado aqui só para
// o corte em memória do passo 2 (ver summarizeObservationStats); a fonte de
// verdade da regra de negócio continua sendo o domínio.
const MIN_OBSERVATIONS_FOR_REFERENCE = 2;

export interface OpportunityCandidateSearchTarget {
  id: string;
  originIata: string;
  destinationIata: string;
  departureDate: Date;
  returnDate: Date | null;
  tripType: SearchTarget['tripType'];
  cabin: string;
  adults: number;
  currency: string;
  market: string;
}

/**
 * SPEC-015 §"Comportamento de domínio", passo 1: candidatos são
 * SearchTargets já existentes e ativos (criados por Watches reais —
 * ver nota na spec sobre o feed não ter um crawler de fundo próprio) com
 * viagem ainda no futuro. Limitado e ordenado por partida mais próxima
 * primeiro — não há paginação de servidor nesta fatia.
 */
export async function listCandidateSearchTargetsForOpportunities(
  prisma: PrismaClient,
  params: { asOf: Date; limit?: number },
): Promise<OpportunityCandidateSearchTarget[]> {
  return prisma.searchTarget.findMany({
    where: { status: 'ACTIVE', departureDate: { gte: params.asOf } },
    orderBy: { departureDate: 'asc' },
    take: params.limit ?? OPPORTUNITIES_SCAN_LIMIT_DEFAULT,
    select: {
      id: true,
      originIata: true,
      destinationIata: true,
      departureDate: true,
      returnDate: true,
      tripType: true,
      cabin: true,
      adults: true,
      currency: true,
      market: true,
    },
  });
}

export interface ObservationStats {
  searchTargetId: string;
  observationCount: number;
  lowestAmountMinor: number;
  averageAmountMinor: number;
}

/**
 * SPEC-015 §"Comportamento de domínio", passo 2: UMA consulta agregada para
 * todos os candidatos do passo 1 — não uma consulta por candidato (mesmo
 * cuidado de fan-out já documentado em EVAL-PERF-002/H09, CLAUDE.md). O
 * corte por `MIN_OBSERVATIONS_FOR_REFERENCE` é aplicado em memória sobre o
 * resultado já limitado pelo passo 1 (o `having` do Prisma existe, mas a
 * sintaxe pro par count/campo agregado é frágil entre versões — filtrar em
 * memória sobre no máximo `OPPORTUNITIES_SCAN_LIMIT_DEFAULT` linhas é mais
 * simples e não tem custo real nessa escala).
 */
export async function summarizeObservationStats(
  prisma: PrismaClient,
  searchTargetIds: string[],
): Promise<Map<string, ObservationStats>> {
  if (searchTargetIds.length === 0) {
    return new Map();
  }
  const grouped = await prisma.priceObservation.groupBy({
    by: ['searchTargetId'],
    where: { searchTargetId: { in: searchTargetIds } },
    _count: { _all: true },
    _min: { totalAmountMinor: true },
    _avg: { totalAmountMinor: true },
  });

  const result = new Map<string, ObservationStats>();
  for (const row of grouped) {
    if (row._count._all < MIN_OBSERVATIONS_FOR_REFERENCE) {
      continue;
    }
    // _min/_avg só são null quando o grupo não tem linhas, o que não
    // acontece aqui (groupBy só devolve grupos com >= 1 linha).
    result.set(row.searchTargetId, {
      searchTargetId: row.searchTargetId,
      observationCount: row._count._all,
      lowestAmountMinor: row._min.totalAmountMinor as number,
      averageAmountMinor: Math.round(row._avg.totalAmountMinor as number),
    });
  }
  return result;
}

export interface LatestObservationForOpportunity {
  totalAmountMinor: number;
  currency: string;
  deeplink: string | null;
  expiresAt: Date | null;
  observedAt: Date;
  providerStrategy: string;
  itinerary: unknown;
}

/**
 * Mesma forma de `LatestObservation` em watch-listing-repository.ts,
 * deliberadamente duplicada aqui (mesmo precedente de
 * DISCOVERY_NORMALIZER_VERSION no SPEC-014) — os dois pontos de leitura
 * evoluem por motivos diferentes (projeção de Watch vs. feed público).
 */
export async function findLatestObservationForSearchTarget(
  prisma: PrismaClient,
  searchTargetId: string,
): Promise<LatestObservationForOpportunity | null> {
  return prisma.priceObservation.findFirst({
    where: { searchTargetId },
    orderBy: { observedAt: 'desc' },
    select: {
      totalAmountMinor: true,
      currency: true,
      deeplink: true,
      expiresAt: true,
      observedAt: true,
      providerStrategy: true,
      itinerary: true,
    },
  });
}

export interface LowestEverObservation {
  totalAmountMinor: number;
  currency: string;
  observedAt: Date;
}

/**
 * "Menor preço já visto para este SearchTarget" — SEM o corte por
 * `watch.startsAt` que `findLowestValidObservation`
 * (packages/database/src/alert-event-repository.ts) aplica. Aquela função
 * responde "menor desde que ESTE Watch existe" (pergunta por-Watch); esta
 * responde "menor que este SearchTarget compartilhado já observou"
 * (pergunta por-SearchTarget) — perguntas diferentes, não uma duplicata.
 */
export async function findLowestEverObservation(
  prisma: PrismaClient,
  searchTargetId: string,
): Promise<LowestEverObservation | null> {
  return prisma.priceObservation.findFirst({
    where: { searchTargetId },
    orderBy: [{ totalAmountMinor: 'asc' }, { observedAt: 'asc' }, { id: 'asc' }],
    select: { totalAmountMinor: true, currency: true, observedAt: true },
  });
}
