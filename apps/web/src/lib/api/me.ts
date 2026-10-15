import type { MeOverviewResponse, UpdateMeResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';

/** SPEC-040: painéis pessoais numa chamada (só banco e cache). */
export function getMeOverview(): Promise<MeOverviewResponse> {
  return apiFetch<MeOverviewResponse>('/v1/me/overview');
}

/** SPEC-040: cidade de partida da conta (null apaga). */
export function updateHomeCity(homeCityCode: string | null): Promise<UpdateMeResponse> {
  return apiFetch<UpdateMeResponse>('/v1/me', {
    method: 'PATCH',
    body: JSON.stringify({ homeCityCode }),
  });
}
