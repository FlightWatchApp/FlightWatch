import type { ListPromotionsResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';

export type PromotionSort = 'score' | 'price' | 'discount';

/** SPEC-032: público, mesmo rate limit da busca (SPEC-025). */
export async function listPromotions(input: {
  origin: string;
  sort?: PromotionSort;
  limit?: number;
}): Promise<ListPromotionsResponse> {
  const params = new URLSearchParams({ origin: input.origin });
  if (input.sort) params.set('sort', input.sort);
  if (input.limit) params.set('limit', String(input.limit));
  return apiFetch<ListPromotionsResponse>(`/v1/promotions?${params.toString()}`);
}
