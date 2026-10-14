import { shouldSyncPlaces } from '@flight-watch/domain';
import {
  type PrismaClient,
  getAirlinesLastSyncedAt,
  syncAirlinesCatalog,
} from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import type { ParsedAirlines } from '@flight-watch/providers';
import type { SchedulerMetrics } from './metrics.js';

export type AirlinesSyncOutcome = 'success' | 'failed' | 'skipped_fresh';

export interface AirlinesSyncDeps {
  prisma: PrismaClient;
  fetchAirlines: () => Promise<ParsedAirlines>;
  metrics: SchedulerMetrics;
  now: () => Date;
}

/**
 * SPEC-038 — catálogo de companhias, com a mesma regra de frescor do catálogo
 * de lugares (vazio ou 7+ dias). Nunca lança: falha registra
 * `airlines_sync_failed` e mantém o catálogo anterior.
 */
export async function runAirlinesSync(deps: AirlinesSyncDeps): Promise<AirlinesSyncOutcome> {
  const { prisma, metrics } = deps;
  const startedAt = deps.now();
  if (!shouldSyncPlaces(await getAirlinesLastSyncedAt(prisma), startedAt)) {
    metrics.airlinesSyncTotal.inc({ result: 'skipped_fresh' });
    return 'skipped_fresh';
  }
  try {
    const parsed = await deps.fetchAirlines();
    // Fonte vazia (resposta corrompida) não serve de catálogo.
    if (parsed.airlines.length === 0) {
      throw new Error('airlines source returned no airlines');
    }
    const result = await syncAirlinesCatalog(prisma, parsed.airlines, startedAt);
    metrics.airlinesSyncTotal.inc({ result: 'success' });
    logEvent({
      event: 'airlines_sync_completed',
      upserted: result.upserted,
      invalid: parsed.invalid,
      durationMs: deps.now().getTime() - startedAt.getTime(),
    });
    return 'success';
  } catch (error) {
    metrics.airlinesSyncTotal.inc({ result: 'failed' });
    logEvent({ event: 'airlines_sync_failed', error });
    return 'failed';
  }
}
