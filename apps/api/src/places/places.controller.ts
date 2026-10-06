import { Controller, Get, Query } from '@nestjs/common';
import type { SearchPlacesQuery, SearchPlacesResponse } from '@flight-watch/contracts';
import { PlacesService } from './places.service.js';
import { SearchPlacesValidationPipe } from './search-places.pipe.js';

/** SPEC-029: autocomplete público, só leitura. */
@Controller('v1/places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  async search(
    @Query(SearchPlacesValidationPipe) query: SearchPlacesQuery,
  ): Promise<SearchPlacesResponse> {
    return { places: await this.places.search(query.q, query.limit) };
  }
}
