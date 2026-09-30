import { Controller, Get, Query } from '@nestjs/common';
import type { ListOpportunitiesQuery, ListOpportunitiesResponse } from '@flight-watch/contracts';
import { ListOpportunitiesValidationPipe } from './list-opportunities.pipe.js';
import { OpportunitiesService } from './opportunities.service.js';

// SPEC-015: público, sem SessionAuthGuard — o feed existe justamente para
// quem ainda não tem Watch. Sem rate limit: leitura local limitada, não uma
// chamada de saída a um provider (mesmo tratamento de GET /v1/searches/flights/:id).
@Controller('v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  async list(
    @Query(ListOpportunitiesValidationPipe) query: ListOpportunitiesQuery,
  ): Promise<ListOpportunitiesResponse> {
    return this.opportunitiesService.listOpportunities(query);
  }
}
