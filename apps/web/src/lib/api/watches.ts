import type {
  ListWatchesResponse,
  WatchDetailResponse,
  WatchListItem,
  WatchPreviewResponse,
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
  notificationChannelId: string;
}

/** SPEC-039: sem regras do cliente — a API cria o alerta de preço baixo. */
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
      notificationChannelId: input.notificationChannelId,
    }),
  });
}

export interface WatchPreviewInput {
  origin: string;
  destination: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  departureDate: string;
  returnDate: string | null;
}

/** SPEC-039: preço normal, menor já observado e preço de hoje antes de criar. */
export function previewWatch(input: WatchPreviewInput): Promise<WatchPreviewResponse> {
  const params = new URLSearchParams({
    origin: input.origin,
    destination: input.destination,
    tripType: input.tripType,
    departureDate: input.departureDate,
  });
  if (input.tripType === 'ROUND_TRIP' && input.returnDate) {
    params.set('returnDate', input.returnDate);
  }
  return apiFetch<WatchPreviewResponse>(`/v1/watches/preview?${params.toString()}`);
}
