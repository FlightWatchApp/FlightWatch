import { ConfigError, loadConfig, schedulerConfig } from '@flight-watch/config';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import { fetchTravelpayoutsPlaces } from '@flight-watch/providers';
import { createSchedulerMetrics } from './metrics.js';
import { PLACES_SOURCE_TIMEOUT_MS, runPlacesSync } from './places-sync.js';

/**
 * SPEC-029: `pnpm --filter @flight-watch/scheduler places:sync` — sincroniza o
 * catálogo agora, mesmo se estiver recente. Sai com 1 se falhar.
 */
async function main(): Promise<void> {
  const config = loadConfig(schedulerConfig, process.env);
  const prisma = createPrismaClient(config.DATABASE_URL);
  try {
    const outcome = await runPlacesSync({
      prisma,
      fetchPlaces: () => fetchTravelpayoutsPlaces({ timeoutMs: PLACES_SOURCE_TIMEOUT_MS }),
      metrics: createSchedulerMetrics(),
      now: () => new Date(),
      force: true,
    });
    process.exitCode = outcome === 'success' ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  logEvent(
    error instanceof ConfigError ? error.toLogEvent() : { event: 'places_sync_cli_failed', error },
  );
  process.exit(1);
});
