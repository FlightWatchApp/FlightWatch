import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { CreateFlightSearchRequest, FlightSearchResponse } from '@flight-watch/contracts';
import { CurrentCorrelationId } from '../observability/correlation.js';
import { CreateFlightSearchValidationPipe } from './create-flight-search.pipe.js';
import { FlightSearchIdValidationPipe } from './flight-search-id.pipe.js';
import { SearchErrorFilter } from './search-error.filter.js';
import { SearchThrottlerGuard } from './search-throttler.guard.js';
import { SearchesService } from './searches.service.js';

// SPEC-014: público — sem SessionAuthGuard. FlightSearch.userId fica sempre
// null nesta fatia (não existe guard de autenticação opcional ainda).
@Controller('v1/searches/flights')
@UseFilters(SearchErrorFilter)
export class SearchesController {
  constructor(private readonly searchesService: SearchesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(SearchThrottlerGuard)
  async search(
    @Body(CreateFlightSearchValidationPipe) body: CreateFlightSearchRequest,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<FlightSearchResponse> {
    return this.searchesService.searchFlights(null, body, correlationId);
  }

  @Get(':id')
  async getById(
    @Param('id', FlightSearchIdValidationPipe) id: string,
  ): Promise<FlightSearchResponse> {
    return this.searchesService.getFlightSearch(id);
  }
}
