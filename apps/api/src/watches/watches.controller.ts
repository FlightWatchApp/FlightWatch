import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateWatchRequest,
  CreateWatchResponse,
  ListWatchesResponse,
  WatchDetailResponse,
  WatchListItem,
} from '@flight-watch/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { CurrentCorrelationId } from '../observability/correlation.js';
import { CreateWatchErrorFilter } from './create-watch-error.filter.js';
import { CreateWatchValidationPipe } from './create-watch.pipe.js';
import { WatchIdValidationPipe } from './watch-id.pipe.js';
import { WatchLifecycleErrorFilter } from './watch-lifecycle-error.filter.js';
import { WatchesService } from './watches.service.js';

@Controller('v1/watches')
@UseGuards(SessionAuthGuard)
@UseFilters(CreateWatchErrorFilter, WatchLifecycleErrorFilter)
export class WatchesController {
  constructor(private readonly watchesService: WatchesService) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<ListWatchesResponse> {
    return this.watchesService.listWatches(userId);
  }

  // SPEC-009
  @Get(':id')
  async detail(
    @CurrentUser() userId: string,
    @Param('id', WatchIdValidationPipe) watchId: string,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<WatchDetailResponse> {
    return this.watchesService.getWatchDetail(userId, watchId, correlationId);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() userId: string,
    @Body(CreateWatchValidationPipe) body: CreateWatchRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<CreateWatchResponse> {
    return this.watchesService.createWatch(userId, body, idempotencyKey);
  }

  // SPEC-008: pausar/reativar/encerrar. Verbos de ação, não PATCH genérico —
  // cada um só é válido a partir de um subconjunto específico de status
  // (DOMAIN.md §3.2), e um PATCH de campo livre abriria espaço pra transições
  // que a spec não cobre.
  @Post(':id/pause')
  @HttpCode(200)
  async pause(
    @CurrentUser() userId: string,
    @Param('id', WatchIdValidationPipe) watchId: string,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<WatchListItem> {
    return this.watchesService.transitionWatch(userId, watchId, 'pause', correlationId);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivate(
    @CurrentUser() userId: string,
    @Param('id', WatchIdValidationPipe) watchId: string,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<WatchListItem> {
    return this.watchesService.transitionWatch(userId, watchId, 'reactivate', correlationId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() userId: string,
    @Param('id', WatchIdValidationPipe) watchId: string,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<WatchListItem> {
    return this.watchesService.transitionWatch(userId, watchId, 'cancel', correlationId);
  }

  // SPEC-018: telemetria de clique, não redirecionamento — o cliente já tem a
  // purchaseUrl (validada) via GET /v1/watches[/:id] e navega direto; este
  // endpoint só registra que o clique aconteceu (AC-006/AC-007).
  @Post(':id/purchase-click')
  @HttpCode(204)
  async purchaseClick(
    @CurrentUser() userId: string,
    @Param('id', WatchIdValidationPipe) watchId: string,
  ): Promise<void> {
    return this.watchesService.recordPurchaseClick(userId, watchId);
  }
}
