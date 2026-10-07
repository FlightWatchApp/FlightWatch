import { shouldSyncPlaces } from '@flight-watch/domain';
import {
  type PrismaClient,
  getPlacesLastSyncedAt,
  syncPlacesCatalog,
} from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import type { ParsedPlaces } from '@flight-watch/providers';
import type { SchedulerMetrics } from './metrics.js';

/** Timeout de cada arquivo do catálogo (são ~3 MB, públicos). */
export const PLACES_SOURCE_TIMEOUT_MS = 30_000;

export type PlacesSyncOutcome = 'success' | 'failed' | 'skipped_fresh';

export interface PlacesSyncDeps {
  prisma: PrismaClient;
  fetchPlaces: () => Promise<ParsedPlaces>;
  metrics: SchedulerMetrics;
  now: () => Date;
  /** Comando manual: ignora o frescor do catálogo. */
  force?: boolean;
}

/**
 * SPEC-029 — sincroniza o catálogo de lugares. Nunca lança: falha registra
 * `places_sync_failed` e mantém o catálogo anterior (a transação de
 * syncPlacesCatalog é tudo ou nada).
 */
export async function runPlacesSync(deps: PlacesSyncDeps): Promise<PlacesSyncOutcome> {
  const { prisma, metrics } = deps;
  const startedAt = deps.now();

  if (!deps.force && !shouldSyncPlaces(await getPlacesLastSyncedAt(prisma), startedAt)) {
    metrics.placesSyncTotal.inc({ result: 'skipped_fresh' });
    return 'skipped_fresh';
  }

  try {
    const parsed = await deps.fetchPlaces();
    const searchableCities = parsed.places.filter(
      (place) => place.kind === 'CITY' && place.searchable,
    ).length;
    // Fonte vazia (resposta corrompida, por exemplo) desativaria o catálogo
    // inteiro e a busca do site pararia — trata como falha.
    if (searchableCities === 0) {
      throw new Error('places source returned no searchable cities');
    }

    const result = await syncPlacesCatalog(prisma, parsed.places, startedAt);

    metrics.placesSyncRecords.reset();
    metrics.placesSyncRecords.set({ kind: 'all', outcome: 'upserted' }, result.upserted);
    metrics.placesSyncRecords.set({ kind: 'all', outcome: 'disabled' }, result.disabled);
    metrics.placesSyncRecords.set({ kind: 'city', outcome: 'invalid' }, parsed.invalid.cities);
    metrics.placesSyncRecords.set({ kind: 'airport', outcome: 'invalid' }, parsed.invalid.airports);
    metrics.placesSyncTotal.inc({ result: 'success' });
    logEvent({
      event: 'places_sync_completed',
      upserted: result.upserted,
      disabled: result.disabled,
      searchableCities,
      invalidCities: parsed.invalid.cities,
      invalidAirports: parsed.invalid.airports,
      ignoredNonAirports: parsed.ignored.nonAirportTypes,
      durationMs: deps.now().getTime() - startedAt.getTime(),
    });
    return 'success';
  } catch (error) {
    metrics.placesSyncTotal.inc({ result: 'failed' });
    logEvent({ event: 'places_sync_failed', error });
    return 'failed';
  }
}
