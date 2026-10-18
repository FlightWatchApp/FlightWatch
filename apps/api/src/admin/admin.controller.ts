import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  Patch,
  type PipeTransform,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { type ZodType } from 'zod';
import {
  type CreateInviteRequest,
  type CreateInviteResponse,
  type ListAdminUsersQuery,
  type ListAdminUsersResponse,
  type ListInvitesQuery,
  type ListInvitesResponse,
  type RevokeInviteResponse,
  type UpdateAdminUserRequest,
  type UpdateAdminUserResponse,
  createInviteRequestSchema,
  listAdminUsersQuerySchema,
  listInvitesQuerySchema,
  updateAdminUserRequestSchema,
} from '@flight-watch/contracts';
import { AuthErrorFilter } from '../auth/auth-error.filter.js';
import { AuthRateLimited } from '../auth/auth-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AdminErrorFilter } from './admin-error.filter.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

@Injectable()
class AdminInputPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_ADMIN_INPUT',
        message: 'invalid admin input',
      });
    }
    return result.data;
  }
}

const pipe = (schema: ZodType) => new AdminInputPipe(schema);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
class IdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) {
      throw new BadRequestException({ code: 'INVALID_ADMIN_INPUT', message: 'invalid id' });
    }
    return value;
  }
}

/** SPEC-043: tudo aqui é 404 para quem não é admin (AdminGuard) e passa pelo throttler `auth`. */
@Controller('v1/admin')
@AuthRateLimited()
@UseGuards(AdminGuard)
@UseFilters(AdminErrorFilter, AuthErrorFilter)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('invites')
  @HttpCode(201)
  createInvite(
    @CurrentUser() adminId: string,
    @Body(pipe(createInviteRequestSchema)) body: CreateInviteRequest,
  ): Promise<CreateInviteResponse> {
    return this.admin.createInvite(adminId, body);
  }

  @Get('invites')
  listInvites(
    @Query(pipe(listInvitesQuerySchema)) query: ListInvitesQuery,
  ): Promise<ListInvitesResponse> {
    return this.admin.listInvites(query);
  }

  @Post('invites/:id/revoke')
  @HttpCode(201)
  revoke(
    @CurrentUser() adminId: string,
    @Param('id', IdPipe) id: string,
  ): Promise<RevokeInviteResponse> {
    return this.admin.revoke(adminId, id);
  }

  @Post('invites/:id/resend')
  @HttpCode(201)
  resend(
    @CurrentUser() adminId: string,
    @Param('id', IdPipe) id: string,
  ): Promise<CreateInviteResponse> {
    return this.admin.resendInvite(adminId, id);
  }

  @Get('users')
  listUsers(
    @Query(pipe(listAdminUsersQuerySchema)) query: ListAdminUsersQuery,
  ): Promise<ListAdminUsersResponse> {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() adminId: string,
    @Param('id', IdPipe) id: string,
    @Body(pipe(updateAdminUserRequestSchema)) body: UpdateAdminUserRequest,
  ): Promise<UpdateAdminUserResponse> {
    return this.admin.updateUser(adminId, id, body);
  }
}
