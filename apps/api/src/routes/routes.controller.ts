import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { GetRouteParams, GetRouteQuery, GetRouteResponse } from '@flight-watch/contracts';
import { SearchErrorFilter } from '../searches/search-error.filter.js';
import { SearchThrottlerGuard } from '../searches/search-throttler.guard.js';
import { AUTH_THROTTLER } from '../throttling/throttling.module.js';
import { GetRouteParamsPipe, GetRouteQueryPipe } from './get-route.pipe.js';
import { RoutesService } from './routes.service.js';

/**
 * SPEC-033: público, com o rate limit `default` (SPEC-025) — robôs de busca
 * também contam. Nenhuma escrita é exposta.
 */
@Controller('v1/routes')
@UseFilters(SearchErrorFilter)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get(':origin/:destination')
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true })
  async get(
    @Param(GetRouteParamsPipe) params: GetRouteParams,
    @Query(GetRouteQueryPipe) query: GetRouteQuery,
  ): Promise<GetRouteResponse> {
    return this.routes.get(params.origin, params.destination, query);
  }
}
