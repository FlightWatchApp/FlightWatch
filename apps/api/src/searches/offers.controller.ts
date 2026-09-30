import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { CreateWatchResponse, DeriveWatchFromOfferRequest } from '@flight-watch/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { CreateWatchErrorFilter } from '../watches/create-watch-error.filter.js';
import { DeriveWatchErrorFilter } from './derive-watch-error.filter.js';
import { DeriveWatchValidationPipe } from './derive-watch.pipe.js';
import { FlightOfferIdValidationPipe } from './flight-offer-id.pipe.js';
import { SearchesService } from './searches.service.js';

@Controller('v1/offers')
@UseGuards(SessionAuthGuard)
@UseFilters(CreateWatchErrorFilter, DeriveWatchErrorFilter)
export class OffersController {
  constructor(private readonly searchesService: SearchesService) {}

  @Post(':id/watch')
  @HttpCode(201)
  async deriveWatch(
    @CurrentUser() userId: string,
    @Param('id', FlightOfferIdValidationPipe) offerId: string,
    @Body(DeriveWatchValidationPipe) body: DeriveWatchFromOfferRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<CreateWatchResponse> {
    return this.searchesService.deriveWatchFromOffer(userId, offerId, body, idempotencyKey);
  }
}
