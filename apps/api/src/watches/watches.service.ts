import { randomUUID, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { logEvent } from '@flight-watch/observability';
import {
  type AlertRuleInput,
  type CreateWatchRequest,
  type CreateWatchResponse,
  type ListWatchesResponse,
  type WatchDetailResponse,
  type WatchListItem as WatchListItemView,
  type WatchLifecycleAction,
  CreateWatchError,
  WatchLifecycleError,
} from '@flight-watch/contracts';
import {
  InvalidSearchTargetInputError,
  computeSearchTargetFingerprintV1,
  resolveCurrentOfferStatus,
  resolvePurchaseUrl,
} from '@flight-watch/domain';
import type { Prisma, WatchStatus } from '@flight-watch/database';
import {
  SearchTargetFingerprintConflictError,
  findOrCreateSearchTarget,
  getWatchDetailForUser,
  getWatchForUser,
  listWatchesForUser,
  transitionWatchStatus,
  withSearchTargetRaceRetry,
  type WatchDetailItem,
  type WatchListItem,
} from '@flight-watch/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { isSupportedSearch } from './supported-catalog.js';

// Placeholder até o produto definir o limite real por plano (PRODUCT.md §10).
const MAX_ACTIVE_WATCHES_PER_USER = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * DOMAIN.md §3.2 declara `expires_at` no Watch, mas nada o setava — ficava
 * `null` pra sempre e o status nunca saía de ACTIVE mesmo muito depois da
 * viagem. Alinhado ao corte que isSearchTargetStillEligible já aplica pro
 * SearchTarget ("departureDate < hoje" torna o target inelegível a partir do
 * dia seguinte à partida): expira à meia-noite UTC do dia seguinte à partida,
 * não no meio do próprio dia de partida. A reconciliação real (transição pra
 * `EXPIRED`) acontece no tick do scheduler (reconcileExpiredWatches).
 */
function computeWatchExpiresAt(departureDate: string): Date {
  const startOfDepartureDay = new Date(`${departureDate}T00:00:00.000Z`);
  return new Date(startOfDepartureDay.getTime() + MS_PER_DAY);
}

type WatchWithRelations = Prisma.WatchGetPayload<{
  include: { alertRules: true; searchTarget: true };
}>;

function canonicalJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(request: CreateWatchRequest): string {
  return createHash('sha256').update(canonicalJsonStringify(request)).digest('hex');
}

// DOMAIN.md §3.3: target_price não tem referência; as demais regras relativas
// usam a observação anterior, exceto new_observed_low, que compara contra o
// menor preço observado (lowest_valid_observation existe no domínio exatamente
// para isso). A spec não deixa o cliente escolher a estratégia em v1 — este é
// o default assumido, documentado aqui por não estar explícito no SPEC-001.
function referenceStrategyForRuleType(
  type: AlertRuleInput['type'],
): 'PREVIOUS_VALID_OBSERVATION' | 'LOWEST_VALID_OBSERVATION' | null {
  switch (type) {
    case 'TARGET_PRICE':
      return null;
    case 'NEW_OBSERVED_LOW':
      return 'LOWEST_VALID_OBSERVATION';
    case 'PERCENTAGE_DROP':
    case 'ABSOLUTE_DROP':
      return 'PREVIOUS_VALID_OBSERVATION';
  }
}

function alertRuleCreateData(rule: AlertRuleInput): Prisma.AlertRuleCreateWithoutWatchInput {
  const base = {
    type: rule.type,
    cooldownSeconds: rule.cooldownSeconds,
    referenceStrategy: referenceStrategyForRuleType(rule.type),
  };
  switch (rule.type) {
    case 'TARGET_PRICE':
      return { ...base, targetAmountMinor: rule.amountMinor };
    case 'PERCENTAGE_DROP':
      return { ...base, dropPercent: rule.percent };
    case 'ABSOLUTE_DROP':
      return { ...base, dropAmountMinor: rule.dropAmountMinor };
    case 'NEW_OBSERVED_LOW':
      return base;
  }
}

function toCreateWatchResponse(watch: WatchWithRelations): CreateWatchResponse {
  return {
    id: watch.id,
    status: watch.status,
    search: {
      origin: watch.searchTarget.originIata,
      destination: watch.searchTarget.destinationIata,
      departureDate: watch.searchTarget.departureDate.toISOString().slice(0, 10),
      returnDate: watch.searchTarget.returnDate
        ? watch.searchTarget.returnDate.toISOString().slice(0, 10)
        : null,
      tripType: watch.searchTarget.tripType,
      cabin: 'ECONOMY',
      adults: 1,
      currency: watch.searchTarget.currency,
    },
    // SPEC-001 §7 mostra "alertRules": [] no exemplo, mas isso contradiz DOMAIN.md
    // §3.3 ("a interface deve mostrar a referência; não se admite fórmula
    // implícita") — devolver vazio esconderia o que foi persistido. Retornando
    // as regras reais; sinalizando a divergência em vez de replicá-la calada.
    alertRules: watch.alertRules.map((rule) => ({
      type: rule.type,
      cooldownSeconds: rule.cooldownSeconds,
      referenceStrategy: rule.referenceStrategy,
      amountMinor: rule.targetAmountMinor,
      percent: rule.dropPercent,
      dropAmountMinor: rule.dropAmountMinor,
    })),
    lastObservation: null,
    createdAt: watch.createdAt.toISOString(),
  };
}

// SPEC-008 §6: mesma tabela de DOMAIN.md §3.2, restrita às ações expostas por
// esta spec (COMPLETED/EXPIRED não são acionáveis pelo usuário).
const LIFECYCLE_ACTION_CONFIG: Record<
  WatchLifecycleAction,
  { from: WatchStatus[]; to: WatchStatus }
> = {
  pause: { from: ['ACTIVE'], to: 'PAUSED' },
  reactivate: { from: ['PAUSED'], to: 'ACTIVE' },
  cancel: { from: ['ACTIVE', 'PAUSED'], to: 'CANCELLED' },
};

type ExecutionOutcome = NonNullable<WatchListItemView['lastCheck']>['outcome'];

const EXECUTION_OUTCOME_BY_STATUS: Record<string, ExecutionOutcome> = {
  SUCCEEDED: 'succeeded',
  NO_OFFERS: 'no_offers',
  RETRYABLE_FAILURE: 'retryable_failure',
  PERMANENT_FAILURE: 'permanent_failure',
  RATE_LIMITED: 'rate_limited',
};

// SPEC-018: mesma forma de item.latestObservation em packages/database, mas
// sem depender do tipo interno do Prisma na assinatura pública desta função.
type LatestObservationForOffer = WatchListItem['latestObservation'];

/**
 * SPEC-018 §"Comportamento de domínio e invariantes": `null` sempre que não
 * há observação OU o deep link não passa em `resolvePurchaseUrl` — nunca uma
 * URL não validada. Expirado continua sendo projetado (com status EXPIRED),
 * só ausente de fato vira `null`.
 */
function toCurrentOffer(
  latestObservation: LatestObservationForOffer,
): WatchListItemView['currentOffer'] {
  if (!latestObservation) {
    return null;
  }
  const purchaseUrl = resolvePurchaseUrl(
    latestObservation.deeplink,
    latestObservation.providerStrategy,
  );
  if (!purchaseUrl) {
    return null;
  }
  return {
    amountMinor: latestObservation.totalAmountMinor,
    currency: latestObservation.currency,
    purchaseUrl,
    provider: latestObservation.providerStrategy,
    observedAt: latestObservation.observedAt.toISOString(),
    expiresAt: latestObservation.expiresAt ? latestObservation.expiresAt.toISOString() : null,
    status: resolveCurrentOfferStatus(latestObservation.expiresAt),
  };
}

function toWatchListItem(item: WatchListItem): WatchListItemView {
  const targetPriceRule = item.alertRules.find((rule) => rule.type === 'TARGET_PRICE');
  // A query em listWatchesForUser já filtra SCHEDULED/RUNNING, então o status
  // aqui é sempre uma das 5 chaves conhecidas — mas o índice de Record ainda
  // pode devolver undefined pro TS (noUncheckedIndexedAccess), então trata como
  // "sem checagem concluída ainda" em vez de assumir silenciosamente.
  const lastCheckOutcome = item.latestExecution
    ? EXECUTION_OUTCOME_BY_STATUS[item.latestExecution.status]
    : undefined;

  return {
    id: item.watch.id,
    status: item.watch.status,
    origin: item.searchTarget.originIata,
    destination: item.searchTarget.destinationIata,
    tripType: item.searchTarget.tripType,
    departureDate: item.searchTarget.departureDate.toISOString().slice(0, 10),
    returnDate: item.searchTarget.returnDate
      ? item.searchTarget.returnDate.toISOString().slice(0, 10)
      : null,
    currency: item.searchTarget.currency,
    currentPrice: item.latestObservation
      ? {
          amountMinor: item.latestObservation.totalAmountMinor,
          currency: item.latestObservation.currency,
        }
      : null,
    lowestPrice: item.lowestObservation
      ? {
          amountMinor: item.lowestObservation.totalAmountMinor,
          currency: item.lowestObservation.currency,
        }
      : null,
    targetAmountMinor: targetPriceRule?.targetAmountMinor ?? null,
    lastCheck:
      item.latestExecution && lastCheckOutcome
        ? { at: item.latestExecution.at.toISOString(), outcome: lastCheckOutcome }
        : null,
    createdAt: item.watch.createdAt.toISOString(),
    expiresAt: item.watch.expiresAt ? item.watch.expiresAt.toISOString() : null,
    currentOffer: toCurrentOffer(item.latestObservation),
  };
}

/** SPEC-009 §7: mesma forma de `toWatchListItem`, com `priceHistory` a mais. */
function toWatchDetailResponse(item: WatchDetailItem): WatchDetailResponse {
  return {
    ...toWatchListItem(item),
    priceHistory: item.priceHistory.map((point) => ({
      id: point.id,
      observedAt: point.observedAt.toISOString(),
      amountMinor: point.totalAmountMinor,
      currency: point.currency,
    })),
  };
}

@Injectable()
export class WatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  // PRODUCT.md §7.3, sem SPEC-00X própria — ver nota em
  // packages/contracts/src/watches/list-watches.ts.
  async listWatches(userId: string): Promise<ListWatchesResponse> {
    const items = await listWatchesForUser(this.prisma.client, userId);
    const watches = items.map(toWatchListItem);
    // SPEC-018 §8: mede cobertura real do CTA de compra — "existe preço" mas
    // "não existe link mostrável" é um dado operacional distinto de "sem
    // observação nenhuma" (esse segundo caso não é contado aqui).
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const watch = watches[index];
      if (item?.latestObservation && !watch?.currentOffer) {
        this.metrics.purchaseLinkMissingTotal.inc({
          provider: item.latestObservation.providerStrategy,
        });
      }
    }
    return { watches };
  }

  /** SPEC-018 §8: `watch_purchase_link_click_total{provider,status}`. */
  async recordPurchaseClick(userId: string, watchId: string): Promise<void> {
    const item = await getWatchForUser(this.prisma.client, userId, watchId);
    if (!item) {
      throw new WatchLifecycleError('WATCH_NOT_FOUND', 'watch not found');
    }
    const currentOffer = toCurrentOffer(item.latestObservation);
    const provider = item.latestObservation?.providerStrategy ?? 'unknown';
    // SPEC-018 §"Observabilidade": status é o valor literal de currentOffer.status
    // (CURRENT/EXPIRED) — 'missing' é um terceiro valor só desta métrica, para o
    // caso raro de um clique reportado sem link mostrável (ex.: preço mudou/expirou
    // entre o cliente buscar a lista e o clique acontecer).
    const status = currentOffer?.status ?? 'missing';
    this.metrics.watchPurchaseLinkClickTotal.inc({ provider, status });
    logEvent({ event: 'watch_purchase_link_click', watchId, provider, status });
  }

  /** SPEC-009 §13: `watch_detail_fetch_total{result}`. */
  async getWatchDetail(
    userId: string,
    watchId: string,
    correlationId: string,
  ): Promise<WatchDetailResponse> {
    const item = await getWatchDetailForUser(this.prisma.client, userId, watchId);
    if (!item) {
      this.metrics.watchDetailFetchTotal.inc({ result: 'not_found' });
      logEvent({ event: 'watch_detail_fetch', watchId, result: 'not_found', correlationId });
      throw new WatchLifecycleError('WATCH_NOT_FOUND', 'watch not found');
    }
    this.metrics.watchDetailFetchTotal.inc({ result: 'success' });
    logEvent({ event: 'watch_detail_fetch', watchId, result: 'success', correlationId });
    return toWatchDetailResponse(item);
  }

  // SPEC-008 §13: labels definidos pela spec são success/idempotent_noop/
  // not_found/invalid_transition — não o errorCode cru (regressão de review:
  // `error.errorCode.toLowerCase()` emitia `watch_not_found`/
  // `invalid_watch_transition`, que não são os valores documentados e
  // deixavam qualquer dashboard/alerta procurando `not_found`/
  // `invalid_transition` silenciosamente sem dado).
  private mapLifecycleErrorToMetricResult(error: unknown): string {
    if (error instanceof WatchLifecycleError) {
      if (error.errorCode === 'WATCH_NOT_FOUND') return 'not_found';
      if (error.errorCode === 'INVALID_WATCH_TRANSITION') return 'invalid_transition';
    }
    return 'internal_error';
  }

  /** SPEC-008 §13: `watch_lifecycle_transition_total{action,result}`. */
  async transitionWatch(
    userId: string,
    watchId: string,
    action: WatchLifecycleAction,
    correlationId: string,
  ): Promise<WatchListItemView> {
    try {
      const { item, result } = await this.doTransitionWatch(userId, watchId, action);
      this.metrics.watchLifecycleTransitionTotal.inc({ action, result });
      logEvent({ event: 'watch_lifecycle_transition', watchId, action, result, correlationId });
      return item;
    } catch (error) {
      const result = this.mapLifecycleErrorToMetricResult(error);
      this.metrics.watchLifecycleTransitionTotal.inc({ action, result });
      logEvent({ event: 'watch_lifecycle_transition', watchId, action, result, correlationId });
      throw error;
    }
  }

  private async doTransitionWatch(
    userId: string,
    watchId: string,
    action: WatchLifecycleAction,
  ): Promise<{ item: WatchListItemView; result: 'success' | 'idempotent_noop' }> {
    const config = LIFECYCLE_ACTION_CONFIG[action];

    // Review F-004: a checagem prévia só precisa do status, não da projeção
    // inteira (3 consultas extras de enrichWatch) — a projeção completa só é
    // buscada quando de fato vai virar resposta (sucesso ou noop idempotente).
    const currentStatus = await this.prisma.client.watch.findFirst({
      where: { id: watchId, userId },
      select: { status: true },
    });
    if (!currentStatus) {
      throw new WatchLifecycleError('WATCH_NOT_FOUND', 'watch not found');
    }

    // SPEC-008 §9: já estar no destino é sucesso idempotente, não conflito —
    // clique duplo ou retry de rede não deve virar erro pro usuário.
    if (currentStatus.status === config.to) {
      const current = await getWatchForUser(this.prisma.client, userId, watchId);
      if (!current) {
        throw new WatchLifecycleError('WATCH_NOT_FOUND', 'watch not found');
      }
      return { item: toWatchListItem(current), result: 'idempotent_noop' };
    }
    if (!config.from.includes(currentStatus.status)) {
      throw new WatchLifecycleError(
        'INVALID_WATCH_TRANSITION',
        `cannot ${action} a watch in status ${currentStatus.status}`,
      );
    }

    const affectedRows = await this.prisma.client.$transaction((tx) =>
      transitionWatchStatus(tx, {
        watchId,
        userId,
        fromStatuses: config.from,
        toStatus: config.to,
      }),
    );
    // SPEC-008 §9: outra requisição venceu a corrida entre a leitura acima e
    // esta escrita condicional. Se o estado atual já é o destino desejado, foi
    // a mesma ação vencendo a corrida — idempotente, não conflito (regressão:
    // duas chamadas concorrentes de "pause" no mesmo Watch faziam a perdedora
    // devolver 409 mesmo com o resultado final correto). Só é conflito de
    // verdade se o estado atual não é nem a origem esperada nem o destino.
    if (affectedRows === 0) {
      const afterRace = await getWatchForUser(this.prisma.client, userId, watchId);
      if (!afterRace) {
        throw new WatchLifecycleError('WATCH_NOT_FOUND', 'watch not found after transition');
      }
      if (afterRace.watch.status === config.to) {
        return { item: toWatchListItem(afterRace), result: 'idempotent_noop' };
      }
      throw new WatchLifecycleError(
        'INVALID_WATCH_TRANSITION',
        'watch status changed concurrently',
      );
    }

    const updated = await getWatchForUser(this.prisma.client, userId, watchId);
    if (!updated) {
      throw new WatchLifecycleError('WATCH_NOT_FOUND', 'watch not found after transition');
    }
    return { item: toWatchListItem(updated), result: 'success' };
  }

  /** SPEC-001 §13: `watch_create_total{result}` — envolve o método inteiro pra não perder nenhum ponto de saída. */
  async createWatch(
    userId: string,
    request: CreateWatchRequest,
    idempotencyKey: string | undefined,
  ): Promise<CreateWatchResponse> {
    try {
      const response = await this.doCreateWatch(userId, request, idempotencyKey);
      this.metrics.watchCreateTotal.inc({ result: 'success' });
      return response;
    } catch (error) {
      const result =
        error instanceof CreateWatchError ? error.errorCode.toLowerCase() : 'internal_error';
      this.metrics.watchCreateTotal.inc({ result });
      throw error;
    }
  }

  private async doCreateWatch(
    userId: string,
    request: CreateWatchRequest,
    idempotencyKey: string | undefined,
  ): Promise<CreateWatchResponse> {
    const requestHash = hashRequest(request);

    if (idempotencyKey) {
      const replay = await this.checkIdempotencyReplay(userId, idempotencyKey, requestHash);
      if (replay) {
        return replay;
      }
    }

    const channel = await this.prisma.client.notificationChannel.findUnique({
      where: { id: request.notificationChannelId },
    });
    // SPEC-001 §8: erro não deve expor se o canal existe/pertence a outra pessoa —
    // por isso "não encontrado" e "encontrado mas inválido" caem no mesmo código.
    if (
      !channel ||
      channel.userId !== userId ||
      channel.status !== 'ACTIVE' ||
      !channel.verifiedAt
    ) {
      throw new CreateWatchError(
        'CHANNEL_NOT_VERIFIED',
        'notification channel is not verified or not owned by this user',
      );
    }

    if (!isSupportedSearch(request)) {
      throw new CreateWatchError(
        'UNSUPPORTED_SEARCH',
        'route, currency or market not supported yet',
      );
    }

    let canonical: ReturnType<typeof computeSearchTargetFingerprintV1>;
    try {
      canonical = computeSearchTargetFingerprintV1({
        origin: request.origin,
        destination: request.destination,
        departureDate: request.departureDate,
        returnDate: request.returnDate,
        tripType: request.tripType,
        cabin: request.cabin,
        adults: request.adults,
        currency: request.currency,
        market: request.market,
      });
    } catch (error) {
      if (error instanceof InvalidSearchTargetInputError) {
        throw new CreateWatchError('INVALID_WATCH_INPUT', error.message);
      }
      throw error;
    }

    const watch = await this.createWatchInTransaction(
      userId,
      request,
      canonical,
      idempotencyKey,
      requestHash,
    );

    return toCreateWatchResponse(watch);
  }

  private async createWatchInTransaction(
    userId: string,
    request: CreateWatchRequest,
    canonical: ReturnType<typeof computeSearchTargetFingerprintV1>,
    idempotencyKey: string | undefined,
    requestHash: string,
  ): Promise<WatchWithRelations> {
    try {
      return await withSearchTargetRaceRetry(() =>
        this.prisma.client.$transaction(async (tx) => {
          // Checagem de quota best-effort: sob concorrência alta, duas requisições
          // podem ler a mesma contagem antes de qualquer uma commitar e as duas
          // passarem. Não há trava atômica de contador ainda — limitação conhecida,
          // aceitável para o MVP, não escondida (AC-008 exige não deixar Target
          // órfão quando a quota estoura, o que esta ordem de checagem preserva;
          // não exige quota infalível sob corrida).
          const activeCount = await tx.watch.count({ where: { userId, status: 'ACTIVE' } });
          if (activeCount >= MAX_ACTIVE_WATCHES_PER_USER) {
            throw new CreateWatchError(
              'WATCH_LIMIT_REACHED',
              'active watch limit reached for this plan',
            );
          }

          const searchTarget = await findOrCreateSearchTarget(tx, {
            fingerprint: canonical.fingerprint,
            canonicalKey: canonical.canonicalKey,
            originIata: request.origin,
            destinationIata: request.destination,
            departureDate: request.departureDate,
            returnDate: request.returnDate,
            tripType: request.tripType,
            cabin: request.cabin,
            adults: request.adults,
            currency: request.currency,
            market: request.market,
          });

          const createdWatch = await tx.watch.create({
            data: {
              userId,
              searchTargetId: searchTarget.id,
              notificationChannelId: request.notificationChannelId,
              status: 'ACTIVE',
              expiresAt: computeWatchExpiresAt(request.departureDate),
              alertRules: { create: request.alertRules.map(alertRuleCreateData) },
            },
            include: { alertRules: true, searchTarget: true },
          });

          const outboxPayload: Prisma.InputJsonValue = {
            eventId: randomUUID(),
            watchId: createdWatch.id,
            searchTargetId: searchTarget.id,
            occurredAt: new Date().toISOString(),
          };
          await tx.outboxEvent.create({
            data: { eventType: 'WatchCreated.v1', payload: outboxPayload },
          });

          if (idempotencyKey) {
            await tx.idempotencyKey.create({
              data: { userId, key: idempotencyKey, requestHash, watchId: createdWatch.id },
            });
          }

          return createdWatch;
        }),
      );
    } catch (error) {
      // SPEC-001 §6: colisão teórica de fingerprint com campos divergentes falha
      // com um erro interno seguro em vez de associar a busca ao target errado.
      if (error instanceof SearchTargetFingerprintConflictError) {
        throw new CreateWatchError('WATCH_CREATION_FAILED', error.message);
      }
      throw error;
    }
  }

  private async checkIdempotencyReplay(
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<CreateWatchResponse | null> {
    const existing = await this.prisma.client.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
      include: { watch: { include: { alertRules: true, searchTarget: true } } },
    });

    if (!existing) {
      return null;
    }
    if (existing.requestHash !== requestHash) {
      throw new CreateWatchError(
        'IDEMPOTENCY_CONFLICT',
        'idempotency key was already used with a different payload',
      );
    }
    if (!existing.watch) {
      throw new CreateWatchError(
        'WATCH_CREATION_FAILED',
        'idempotency record exists without an associated watch',
      );
    }
    return toCreateWatchResponse(existing.watch);
  }
}
