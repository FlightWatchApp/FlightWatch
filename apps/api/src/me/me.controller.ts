import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Patch,
  type PipeTransform,
  UseGuards,
} from '@nestjs/common';
import {
  type MeOverviewResponse,
  type UpdateMeRequest,
  type UpdateMeResponse,
  updateMeRequestSchema,
} from '@flight-watch/contracts';
import { AuthRateLimited } from '../auth/auth-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { MeService } from './me.service.js';

@Injectable()
class UpdateMeValidationPipe implements PipeTransform<unknown, UpdateMeRequest> {
  transform(value: unknown): UpdateMeRequest {
    const result = updateMeRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({ code: 'INVALID_INPUT', message: 'invalid account update' });
    }
    return result.data;
  }
}

/** SPEC-040: dados da própria conta para os painéis pessoais. */
@Controller('v1/me')
@UseGuards(SessionAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('overview')
  async overview(@CurrentUser() userId: string): Promise<MeOverviewResponse> {
    return this.me.overview(userId);
  }

  /** Mesmo limite das rotas de conta (SPEC-025). */
  @Patch()
  @HttpCode(200)
  @AuthRateLimited()
  async update(
    @CurrentUser() userId: string,
    @Body(UpdateMeValidationPipe) body: UpdateMeRequest,
  ): Promise<UpdateMeResponse> {
    return this.me.updateHomeCity(userId, body.homeCityCode);
  }
}
