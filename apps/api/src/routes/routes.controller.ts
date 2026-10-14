import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  GetRouteFactsResponse,
  GetRouteOfferParams,
  GetRouteOfferResponse,
  GetRouteParams,
  GetRouteQuery,
  GetRouteResponse,
  ListRoutesResponse,
} from '@flight-watch/contracts';
import { SearchErrorFilter } from '../searches/search-error.filter.js';
import { SearchThrottlerGuard } from '../searches/search-throttler.guard.js';
import { AUTH_THROTTLER, SEARCH_THROTTLER } from '../throttling/throttling.module.js';
import {
  GetRouteOfferParamsPipe,
  GetRouteParamsPipe,
  GetRouteQueryPipe,
} from './get-route.pipe.js';
import { RoutesService } from './routes.service.js';

/**
 * SPEC-033: público, com o rate limit `pages` (ROUTE_PAGE_RATE_LIMIT_MAX por IP):
 * mais folgado que a busca, porque uma visita pré-carrega links e o que protege
 * a cota da fonte é o orçamento diário da página. Nenhuma escrita é exposta.
 */
@Controller('v1/routes')
@UseFilters(SearchErrorFilter)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  /** Rotas do sitemap (SPEC-033 §SEO). */
  @Get()
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [SEARCH_THROTTLER]: true })
  async list(): Promise<ListRoutesResponse> {
    return this.routes.sitemap();
  }

  /** Fatos do catálogo (lugares, distância, tempo estimado), sem preço nem fonte. */
  @Get(':origin/:destination/facts')
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [SEARCH_THROTTLER]: true })
  async facts(@Param(GetRouteParamsPipe) params: GetRouteParams): Promise<GetRouteFactsResponse> {
    return this.routes.facts(params.origin, params.destination);
  }

  /** SPEC-038: oferta de um dia (só ida). */
  @Get(':origin/:destination/offers/:date')
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [SEARCH_THROTTLER]: true })
  async offer(
    @Param(GetRouteOfferParamsPipe) params: GetRouteOfferParams,
  ): Promise<GetRouteOfferResponse> {
    return this.routes.offer(params.origin, params.destination, params.date);
  }

  @Get(':origin/:destination')
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [SEARCH_THROTTLER]: true })
  async get(
    @Param(GetRouteParamsPipe) params: GetRouteParams,
    @Query(GetRouteQueryPipe) query: GetRouteQuery,
  ): Promise<GetRouteResponse> {
    return this.routes.get(params.origin, params.destination, query);
  }
}
