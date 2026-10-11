import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { PriceCalendarQuery, PriceCalendarResponse } from '@flight-watch/contracts';
import { AUTH_THROTTLER, PAGES_THROTTLER } from '../throttling/throttling.module.js';
import { PriceCalendarValidationPipe } from './price-calendar.pipe.js';
import { SearchErrorFilter } from './search-error.filter.js';
import { SearchThrottlerGuard } from './search-throttler.guard.js';
import { SearchesService } from './searches.service.js';

/**
 * SPEC-031: público, como a busca (SPEC-014), e no mesmo orçamento de rate
 * limit — cada chamada consulta a fonte de preços.
 */
@Controller('v1/price-calendar')
@UseFilters(SearchErrorFilter)
export class PriceCalendarController {
  constructor(private readonly searchesService: SearchesService) {}

  @Get()
  @UseGuards(SearchThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [PAGES_THROTTLER]: true })
  async get(
    @Query(PriceCalendarValidationPipe) query: PriceCalendarQuery,
  ): Promise<PriceCalendarResponse> {
    return this.searchesService.getPriceCalendar(query);
  }
}
