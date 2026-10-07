import type { Job } from 'bullmq';
import {
  type Prisma,
  type PrismaClient,
  StaleLeaseError,
  claimSearchExecutionForRunning,
  findLatestObservationFact,
  findSearchExecutionByIdempotencyKey,
  isSearchTargetStillEligible,
  markSearchExecutionFailed,
  persistNoOffersResult,
  persistPriceObservationSuccess,
  persistUnchangedResult,
  withUniqueConstraintRetry,
} from '@flight-watch/database';
import {
  computeObservationKey,
  computeObservedAtBucket,
  countEligibleOffers,
  selectBestOffer,
  toStoredItinerary,
} from '@flight-watch/domain';
import { logEvent } from '@flight-watch/observability';
import {
  type CircuitBreaker,
  type FlightProvider,
  type ProviderSearchResult,
  ProviderError,
  type TokenBucketRateLimiter,
} from '@flight-watch/providers';
import type { PriceCheckRequestedJob } from '@flight-watch/queue';
import type { PriceWorkerMetrics } from './metrics.js';

type StaleLeaseAction = 'mark_failed' | 'persist_no_offers' | 'persist_success';

/**
 * SPEC-011 §4: converte a rejeição de lease obsoleto num caminho terminal
 * benigno — a execução já não pertence mais a este worker (foi reconciliada
 * como abandonada enquanto ele ainda processava). Não relança: relançar
 * geraria um retry do BullMQ para um trabalho que não tem mais dono.
 */
async function runLeaseAware(
  metrics: PriceWorkerMetrics,
  action: StaleLeaseAction,
  searchExecutionId: string,
  operation: () => Promise<void>,
): Promise<'ok' | 'stale_lease'> {
  try {
    await operation();
    return 'ok';
  } catch (error) {
    if (error instanceof StaleLeaseError) {
      metrics.staleLeaseRejectionsTotal.inc({ action });
      logEvent({ event: 'search_execution_stale_lease_rejected', searchExecutionId, action });
      return 'stale_lease';
    }
    throw error;
  }
}

// SPEC-004 §3: versão da política de seleção/normalização — muda só com decisão
// deliberada, nunca implicitamente (auditabilidade do alerta).
const SELECTION_AND_NORMALIZER_VERSION = 1;

// Estados terminais: um job redelivered para uma execução já resolvida não
// reprocessa (AC-009). RETRYABLE_FAILURE/RATE_LIMITED NÃO entram aqui — são o
// ponto inteiro do retry (ver claimSearchExecutionForRunning).
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'NO_OFFERS', 'PERMANENT_FAILURE']);

export interface ProcessJobDeps {
  prisma: PrismaClient;
  provider: FlightProvider;
  rateLimiter: TokenBucketRateLimiter;
  circuitBreaker: CircuitBreaker;
  metrics: PriceWorkerMetrics;
}

/**
 * SPEC-003 §5 + SPEC-004 §5/§6: consome um job `PriceCheckRequested.v1`,
 * consulta o provedor (via porta ADR-004) e persiste o resultado. Cada `await
 * prisma.$transaction` é deliberadamente uma transação curta e independente —
 * nunca segura uma chamada de rede (o provider.search) dentro de uma transação
 * do Postgres, para não travar linhas enquanto espera I/O externo.
 */
export async function processPriceCheckJob(
  deps: ProcessJobDeps,
  job: Job<PriceCheckRequestedJob>,
): Promise<void> {
  const { prisma, provider, rateLimiter, circuitBreaker, metrics } = deps;
  const data = job.data;

  const executionRef = await prisma.$transaction((tx) =>
    findSearchExecutionByIdempotencyKey(tx, data.idempotencyKey),
  );
  if (!executionRef) {
    // Execução nunca existiu (ou foi limpa) — não há o que reprocessar.
    return;
  }
  if (TERMINAL_STATUSES.has(executionRef.status)) {
    if (executionRef.status === 'SUCCEEDED' && executionRef.priceObservation) {
      metrics.priceObservationTotal.inc({ result: 'idempotent_replay' });
    }
    return;
  }

  const running = await prisma.$transaction((tx) =>
    claimSearchExecutionForRunning(tx, executionRef.id, provider.strategy),
  );
  if (!running) {
    // Corrida perdida (outra entrega já reivindicou) ou virou terminal entre a
    // leitura acima e a tentativa de claim — nos dois casos, não reprocessa.
    return;
  }
  // SPEC-011: claimSearchExecutionForRunning sempre grava um leaseToken junto
  // da transição pra RUNNING — se `running` não é null, o campo está setado.
  // Extraído numa const pra carregar a garantia através das funções abaixo
  // (o tipo do Prisma é `string | null` porque a coluna é nullable em geral).
  const leaseToken = running.leaseToken;
  if (!leaseToken) {
    throw new Error(`invariant violated: claimed execution ${running.id} has no leaseToken`);
  }

  const stillEligible = await prisma.$transaction((tx) =>
    isSearchTargetStillEligible(tx, running.searchTarget.id),
  );
  if (!stillEligible) {
    // SPEC-003 §2/§5: target cancelado, sem Watch ativo, ou partida já passou
    // desde o agendamento — não gasta chamada de provedor à toa.
    await runLeaseAware(metrics, 'mark_failed', running.id, () =>
      prisma.$transaction((tx) =>
        markSearchExecutionFailed(tx, {
          searchExecutionId: running.id,
          leaseToken,
          status: 'PERMANENT_FAILURE',
          errorCode: 'TARGET_NO_LONGER_ELIGIBLE',
        }),
      ),
    );
    return;
  }

  const canAttempt = circuitBreaker.canAttempt();
  metrics.circuitBreakerOpen.set(
    { provider: provider.strategy },
    circuitBreaker.getState() === 'OPEN' ? 1 : 0,
  );
  if (!canAttempt) {
    metrics.providerCallTotal.inc({ provider: provider.strategy, result: 'circuit_open' });
    await runLeaseAware(metrics, 'mark_failed', running.id, () =>
      prisma.$transaction((tx) =>
        markSearchExecutionFailed(tx, {
          searchExecutionId: running.id,
          leaseToken,
          status: 'RETRYABLE_FAILURE',
          errorCode: 'CIRCUIT_OPEN',
        }),
      ),
    );
    metrics.circuitBreakerOpen.set(
      { provider: provider.strategy },
      circuitBreaker.getState() === 'OPEN' ? 1 : 0,
    );
    throw new Error('circuit breaker open, retry later');
  }

  if (!rateLimiter.tryAcquire()) {
    metrics.providerCallTotal.inc({ provider: provider.strategy, result: 'local_rate_limited' });
    await runLeaseAware(metrics, 'mark_failed', running.id, () =>
      prisma.$transaction((tx) =>
        markSearchExecutionFailed(tx, {
          searchExecutionId: running.id,
          leaseToken,
          status: 'RATE_LIMITED',
          errorCode: 'LOCAL_RATE_LIMIT',
        }),
      ),
    );
    throw new Error('rate limit exhausted, retry later');
  }

  const query = {
    originIata: running.searchTarget.originIata,
    destinationIata: running.searchTarget.destinationIata,
    departureDate: running.searchTarget.departureDate.toISOString().slice(0, 10),
    returnDate: running.searchTarget.returnDate
      ? running.searchTarget.returnDate.toISOString().slice(0, 10)
      : null,
    tripType: running.searchTarget.tripType,
    cabin: running.searchTarget.cabin,
    adults: running.searchTarget.adults,
    currency: running.searchTarget.currency,
    market: running.searchTarget.market,
  };

  const searchResult = await attemptSearch(
    prisma,
    provider,
    circuitBreaker,
    running.id,
    leaseToken,
    query,
    data,
    metrics,
  );
  if (!searchResult) {
    return;
  }

  const nextCheckAt = new Date(Date.now() + running.searchTarget.checkIntervalSeconds * 1000);

  if (searchResult.kind === 'no_offers') {
    const outcome = await runLeaseAware(metrics, 'persist_no_offers', running.id, () =>
      prisma.$transaction((tx) =>
        persistNoOffersResult(tx, {
          searchExecutionId: running.id,
          leaseToken,
          searchTargetId: running.searchTarget.id,
          completedAt: new Date(),
          nextCheckAt,
          offersReceivedCount: 0,
        }),
      ),
    );
    if (outcome === 'ok') {
      metrics.priceObservationTotal.inc({ result: 'no_offers' });
    }
    return;
  }

  const offerContext = {
    originIata: running.searchTarget.originIata,
    destinationIata: running.searchTarget.destinationIata,
    currency: running.searchTarget.currency,
    adults: running.searchTarget.adults,
    departureDate: query.departureDate,
    returnDate: query.returnDate,
  };
  metrics.offersReceivedTotal.inc(searchResult.offers.length);
  metrics.offersEligibleTotal.inc(countEligibleOffers(searchResult.offers, offerContext));

  const selected = selectBestOffer(searchResult.offers, offerContext);

  if (!selected) {
    const outcome = await runLeaseAware(metrics, 'persist_no_offers', running.id, () =>
      prisma.$transaction((tx) =>
        persistNoOffersResult(tx, {
          searchExecutionId: running.id,
          leaseToken,
          searchTargetId: running.searchTarget.id,
          completedAt: new Date(),
          nextCheckAt,
          offersReceivedCount: searchResult.offers.length,
        }),
      ),
    );
    if (outcome === 'ok') {
      metrics.priceObservationTotal.inc({ result: 'no_offers' });
    }
    return;
  }

  // SPEC-030: o instante em que o preço foi encontrado pela fonte (para um
  // cache, pode ser horas antes desta checagem), nunca no futuro. A idade
  // exibida ao usuário é a do preço, não a da nossa consulta.
  const now = new Date();
  const offerObservedAt = new Date(selected.offer.observedAt);
  const observedAt =
    Number.isNaN(offerObservedAt.getTime()) || offerObservedAt > now ? now : offerObservedAt;

  // SPEC-030: mesmo fato da última observação (cache sem novidade) não vira
  // observação nova nem reavalia alertas; só reagenda o alvo.
  const latest = await findLatestObservationFact(prisma, running.searchTarget.id);
  if (
    latest &&
    latest.observedAt.getTime() === observedAt.getTime() &&
    latest.totalAmountMinor === selected.offer.totalAmountMinor &&
    latest.offerSignature === selected.signature
  ) {
    try {
      await prisma.$transaction((tx) =>
        persistUnchangedResult(tx, {
          searchExecutionId: running.id,
          leaseToken,
          searchTargetId: running.searchTarget.id,
          completedAt: now,
          nextCheckAt,
          offersReceivedCount: searchResult.offers.length,
        }),
      );
      metrics.priceObservationTotal.inc({ result: 'unchanged' });
    } catch (error) {
      if (error instanceof StaleLeaseError) {
        metrics.staleLeaseRejectionsTotal.inc({ action: 'persist_unchanged' });
        logEvent({
          event: 'search_execution_stale_lease_rejected',
          searchExecutionId: running.id,
          action: 'persist_unchanged',
        });
        return;
      }
      throw error;
    }
    return;
  }

  const observedAtBucket = computeObservedAtBucket(observedAt);
  const observationKey = computeObservationKey({
    searchExecutionId: running.id,
    offerSignature: selected.signature,
    observedAtBucket,
    normalizerVersion: SELECTION_AND_NORMALIZER_VERSION,
  });

  // SPEC-004: findOrCreate por observationKey pode perder uma corrida sob
  // redelivery concorrente do mesmo job — envolve com retry (packages/database/src/concurrency.ts).
  // SPEC-011: StaleLeaseError é tratado à parte de withUniqueConstraintRetry —
  // não é uma corrida de constraint única, é a execução não ser mais dona do
  // seu próprio resultado; não faz sentido retentar, só desistir de escrever.
  try {
    const { created } = await withUniqueConstraintRetry(
      () =>
        prisma.$transaction((tx) =>
          persistPriceObservationSuccess(tx, {
            searchExecutionId: running.id,
            leaseToken,
            searchTargetId: running.searchTarget.id,
            providerStrategy: provider.strategy,
            correlationId: data.correlationId,
            observedAt,
            totalAmountMinor: selected.offer.totalAmountMinor,
            currency: selected.offer.currency,
            // SPEC-030: o domínio é dono do formato gravado (trechos ou resumo).
            itinerary: toStoredItinerary(selected.offer) as Prisma.InputJsonValue,
            offerSignature: selected.signature,
            deeplink: selected.offer.deeplink ?? null,
            expiresAt: selected.offer.expiresAt ? new Date(selected.offer.expiresAt) : null,
            qualityFlags: selected.offer.qualityFlags ?? [],
            observationKey,
            selectionPolicyVersion: selected.selectionPolicyVersion,
            normalizerVersion: SELECTION_AND_NORMALIZER_VERSION,
            offersReceivedCount: searchResult.offers.length,
            nextCheckAt,
          }),
        ),
      'observationKey',
    );
    metrics.priceObservationTotal.inc({ result: created ? 'success' : 'idempotent_replay' });
  } catch (error) {
    if (error instanceof StaleLeaseError) {
      metrics.staleLeaseRejectionsTotal.inc({ action: 'persist_success' });
      logEvent({
        event: 'search_execution_stale_lease_rejected',
        searchExecutionId: running.id,
        action: 'persist_success',
      });
      return;
    }
    throw error;
  }
}

type SearchQuery = Parameters<FlightProvider['search']>[0];

async function attemptSearch(
  prisma: PrismaClient,
  provider: FlightProvider,
  circuitBreaker: CircuitBreaker,
  searchExecutionId: string,
  leaseToken: string,
  query: SearchQuery,
  data: PriceCheckRequestedJob,
  metrics: PriceWorkerMetrics,
): Promise<ProviderSearchResult | null> {
  const stopTimer = metrics.providerCallDurationSeconds.startTimer({ provider: provider.strategy });
  try {
    const result = await provider.search(query, {
      correlationId: data.correlationId,
      searchExecutionId,
    });
    stopTimer();
    metrics.providerCallTotal.inc({ provider: provider.strategy, result: 'success' });
    circuitBreaker.recordSuccess();
    metrics.circuitBreakerOpen.set({ provider: provider.strategy }, 0);
    return result;
  } catch (error) {
    stopTimer();
    circuitBreaker.recordFailure();
    metrics.circuitBreakerOpen.set(
      { provider: provider.strategy },
      circuitBreaker.getState() === 'OPEN' ? 1 : 0,
    );
    const providerError =
      error instanceof ProviderError ? error : new ProviderError('UNAVAILABLE', String(error));
    metrics.providerCallTotal.inc({
      provider: provider.strategy,
      result: providerError.errorClass,
    });

    const status = !providerError.retryable
      ? 'PERMANENT_FAILURE'
      : providerError.errorClass === 'RATE_LIMITED'
        ? 'RATE_LIMITED'
        : 'RETRYABLE_FAILURE';

    // SPEC-011: este ponto é o mais exposto à corrida com a reconciliação —
    // `provider.search` pode ter demorado o bastante pra execução ter sido
    // marcada abandonada enquanto ainda estava em voo.
    await runLeaseAware(metrics, 'mark_failed', searchExecutionId, () =>
      prisma.$transaction((tx) =>
        markSearchExecutionFailed(tx, {
          searchExecutionId,
          leaseToken,
          status,
          errorCode: providerError.errorClass,
        }),
      ),
    );

    if (providerError.retryable) {
      // Relança para o BullMQ reagendar conforme o backoff configurado na fila.
      throw providerError;
    }
    return null; // permanente: não relança, não há o que retentar.
  }
}
