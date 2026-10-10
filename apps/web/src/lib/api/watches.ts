import type {
  ListWatchesResponse,
  WatchDetailResponse,
  WatchListItem,
} from '@flight-watch/contracts';
import { apiFetch } from './client';
import type { WatchDetail, WatchSummary } from './types';

// A UI mostra todos os monitoramentos do usuário; a API pagina (checklist
// pré-lançamento #2), então seguimos o cursor com teto para não girar sem fim.
const MAX_LIST_PAGES = 20;

export async function listWatches(): Promise<WatchSummary[]> {
  const watches: WatchSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response: ListWatchesResponse = await apiFetch<ListWatchesResponse>(
      `/v1/watches${query}`,
    );
    watches.push(...response.watches);
    cursor = response.nextCursor;
    if (!cursor) break;
  }
  return watches;
}

export async function getWatch(id: string): Promise<WatchDetail> {
  return apiFetch<WatchDetailResponse>(`/v1/watches/${id}`);
}

/** SPEC-008: os três verbos de ação devolvem o Watch atualizado na mesma forma de um item de listagem. */
function transitionWatch(id: string, action: 'pause' | 'reactivate' | 'cancel') {
  return apiFetch<WatchListItem>(`/v1/watches/${id}/${action}`, { method: 'POST' });
}

export function pauseWatch(id: string): Promise<WatchSummary> {
  return transitionWatch(id, 'pause');
}

export function reactivateWatch(id: string): Promise<WatchSummary> {
  return transitionWatch(id, 'reactivate');
}

export function cancelWatch(id: string): Promise<WatchSummary> {
  return transitionWatch(id, 'cancel');
}

/** SPEC-018: fire-and-forget — nunca deve bloquear ou desfazer a navegação para o link de compra. */
export async function recordPurchaseClick(id: string): Promise<void> {
  await apiFetch<undefined>(`/v1/watches/${id}/purchase-click`, { method: 'POST' });
}

export interface CreateWatchInput {
  origin: string;
  destination: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  departureDate: string;
  returnDate: string | null;
  currency: string;
  market: string;
  targetAmountMinor: number;
  notificationChannelId: string;
}

/**
 * Só cobre a regra TARGET_PRICE por enquanto — a API já suporta as outras 3
 * (percentage_drop/absolute_drop/new_observed_low) desde a Fase 2, essa
 * primeira versão do formulário só não expõe seletor de tipo de regra ainda.
 */
export async function createWatch(input: CreateWatchInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/v1/watches', {
    method: 'POST',
    body: JSON.stringify({
      origin: input.origin,
      destination: input.destination,
      tripType: input.tripType,
      departureDate: input.departureDate,
      returnDate: input.tripType === 'ROUND_TRIP' ? input.returnDate : null,
      cabin: 'ECONOMY',
      adults: 1,
      currency: input.currency,
      market: input.market,
      alertRules: [
        { type: 'TARGET_PRICE', amountMinor: input.targetAmountMinor, cooldownSeconds: 43_200 },
      ],
      notificationChannelId: input.notificationChannelId,
    }),
  });
}
