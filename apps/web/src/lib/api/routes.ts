import { cache } from 'react';
import type { GetRouteResponse, ListRoutesResponse } from '@flight-watch/contracts';
import { apiFetch } from './client';

/**
 * SPEC-033: página da rota numa chamada. `cache` do React: a página e o
 * `generateMetadata` da mesma requisição fazem uma chamada só à API.
 */
export const getRoute = cache((origin: string, destination: string): Promise<GetRouteResponse> =>
  apiFetch<GetRouteResponse>(
    `/v1/routes/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`,
  ),
);

/** SPEC-033 §SEO: rotas do sitemap (cidades configuradas, destinos com preço). */
export function listSitemapRoutes(): Promise<ListRoutesResponse> {
  return apiFetch<ListRoutesResponse>('/v1/routes');
}
