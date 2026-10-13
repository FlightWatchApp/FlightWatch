import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  ListPromotionHighlightsQuery,
  ListPromotionHighlightsResponse,
  ListPromotionsQuery,
  ListPromotionsResponse,
} from '@flight-watch/contracts';
import { SearchErrorFilter } from '../searches/search-error.filter.js';
import { SearchThrottlerGuard } from '../searches/search-throttler.guard.js';
import {
  AUTH_THROTTLER,
  PAGES_THROTTLER,
  SEARCH_THROTTLER,
} from '../throttling/throttling.module.js';
import {
  ListPromotionHighlightsValidationPipe,
  ListPromotionsValidationPipe,
} from './list-promotions.pipe.js';
import { PromotionsService } from './promotions.service.js';

/**
 * SPEC-032: público, com o rate limit `default` (SPEC-025) — uma origem fria
 * consulta a fonte. Nenhuma escrita é exposta.
 */
@Controller('v1/promotions')
@UseFilters(SearchErrorFilter)
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /** SPEC-034: vitrine, só do cache — limite `pages` (chamada a cada visita sem cidade). */
  @Get('highlights')
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [SEARCH_THROTTLER]: true })
  async highlights(
    @Query(ListPromotionHighlightsValidationPipe) query: ListPromotionHighlightsQuery,
  ): Promise<ListPromotionHighlightsResponse> {
    return this.promotions.highlights(query);
  }

  @Get()
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [PAGES_THROTTLER]: true })
  async list(
    @Query(ListPromotionsValidationPipe) query: ListPromotionsQuery,
  ): Promise<ListPromotionsResponse> {
    return this.promotions.list(query);
  }
}
