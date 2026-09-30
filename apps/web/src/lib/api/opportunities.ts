import type { ListOpportunitiesResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';
import type { DealType, OpportunityItem } from './types';

export interface ListOpportunitiesInput {
  origin?: string;
  destination?: string;
  maxPriceMinor?: number;
  dealType?: DealType;
  sort?: 'best_value' | 'lowest_price' | 'most_recent' | 'shortest_duration';
}

/** SPEC-015: público — funciona sem sessão, mesmo padrão de searches.ts (SPEC-014). */
export async function listOpportunities(
  input: ListOpportunitiesInput = {},
): Promise<OpportunityItem[]> {
  const params = new URLSearchParams();
  if (input.origin) params.set('origin', input.origin);
  if (input.destination) params.set('destination', input.destination);
  if (input.maxPriceMinor) params.set('maxPriceMinor', String(input.maxPriceMinor));
  if (input.dealType) params.set('dealType', input.dealType);
  if (input.sort) params.set('sort', input.sort);

  const query = params.toString();
  const response = await apiFetch<ListOpportunitiesResponse>(
    `/v1/opportunities${query ? `?${query}` : ''}`,
  );
  return response.opportunities;
}
