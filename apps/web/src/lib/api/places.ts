import type { SearchPlacesResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';
import type { Place } from './types';

/** SPEC-029: autocomplete público de cidades (`GET /v1/places`). */
export async function searchPlaces(query: string, limit = 8): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await apiFetch<SearchPlacesResponse>(`/v1/places?${params.toString()}`);
  return response.places;
}
