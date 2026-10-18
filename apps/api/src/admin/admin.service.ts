import { Inject, Injectable } from '@nestjs/common';
import {
  AdminError,
  type AdminUserView,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type InviteState,
  type InviteView,
  type ListAdminUsersQuery,
  type ListAdminUsersResponse,
  type ListInvitesQuery,
  type ListInvitesResponse,
  type RevokeInviteResponse,
  type UpdateAdminUserRequest,
  type UpdateAdminUserResponse,
} from '@flight-watch/contracts';
import type { AccessInvite, Prisma, User } from '@flight-watch/database';
import { recordAdminAction, suspendUserAccess } from '@flight-watch/database';
import { monthWindow } from '@flight-watch/domain';
import { renderInviteEmail } from '@flight-watch/notifications';
import type { EmailSender } from '@flight-watch/notifications';
import { logEvent } from '@flight-watch/observability';
import { EMAIL_SENDER } from '../auth/email-sender.token.js';
import { hashOpaqueToken } from '../auth/opaque-token.js';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type IssuedInvite, issueInvite, revokeInvite } from './admin-core.js';

function stateOf(invite: AccessInvite, now: Date): InviteState {
  if (invite.status === 'AVAILABLE' && invite.expiresAt.getTime() < now.getTime()) {
    return 'EXPIRED';
  }
  return invite.status;
}

function toInviteView(invite: AccessInvite, now: Date): InviteView {
  return {
    id: invite.id,
    email: invite.email,
    state: stateOf(invite, now),
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    redeemedAt: invite.redeemedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
  };
}

/** SPEC-043 — administração de convites e pessoas pelo site. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async createInvite(adminId: string, request: CreateInviteRequest): Promise<CreateInviteResponse> {
    return this.issueAndSend(adminId, request.email, request.ttlDays, 'invite_created');
  }

  async resendInvite(adminId: string, inviteId: string): Promise<CreateInviteResponse> {
    const previous = await this.prisma.client.accessInvite.findUnique({ where: { id: inviteId } });
    if (!previous) {
      throw new AdminError('NOT_FOUND', 'invite not found');
    }
    return this.issueAndSend(adminId, previous.email, undefined, 'invite_resent');
  }

  private async issueAndSend(
    adminId: string,
    email: string,
    ttlDays: number | undefined,
    action: 'invite_created' | 'invite_resent',
  ): Promise<CreateInviteResponse> {
    const now = new Date();
    const issued = await issueInvite(this.prisma.client, {
      email,
      ttlDays: ttlDays ?? this.config.INVITE_TTL_DAYS,
      actor: adminId,
      action,
      now,
    });
    this.metrics.accessInvitesTotal.inc({ source: 'admin', result: 'created' });
    this.metrics.adminActionsTotal.inc({ action });

    // Depois do commit: falha no envio não desfaz a chave (o admin já a tem na tela).
    const emailSent = await this.sendInviteEmail(issued, ttlDays ?? this.config.INVITE_TTL_DAYS)
      .then(() => true)
      .catch((error: unknown) => {
        logEvent({ event: 'invite_email_send_failed', error });
        return false;
      });

    const invite = await this.prisma.client.accessInvite.findUniqueOrThrow({
      where: { id: issued.inviteId },
    });
    return { invite: toInviteView(invite, now), code: issued.code, emailSent };
  }

  private async sendInviteEmail(issued: IssuedInvite, validityDays: number): Promise<void> {
    const normalized = issued.code.replaceAll('-', '');
    // Fragmento (#), que o navegador não envia ao servidor: a chave não aparece em log de acesso.
    const registerUrl = `${this.config.WEB_BASE_URL}/register#convite=${normalized}&email=${encodeURIComponent(issued.email)}`;
    const rendered = renderInviteEmail({ registerUrl, code: issued.code, validityDays });
    await this.emailSender.send({
      to: issued.email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      idempotencyKey: `access-invite-${hashOpaqueToken(normalized)}`,
    });
  }

  async revoke(adminId: string, inviteId: string): Promise<RevokeInviteResponse> {
    const now = new Date();
    await revokeInvite(this.prisma.client, { inviteId, actor: adminId, now });
    this.metrics.accessInvitesTotal.inc({ source: 'admin', result: 'revoked' });
    this.metrics.adminActionsTotal.inc({ action: 'invite_revoked' });
    const invite = await this.prisma.client.accessInvite.findUniqueOrThrow({
      where: { id: inviteId },
    });
    return { invite: toInviteView(invite, now) };
  }

  async listInvites(query: ListInvitesQuery): Promise<ListInvitesResponse> {
    const now = new Date();
    const where: Prisma.AccessInviteWhereInput =
      query.state === 'EXPIRED'
        ? { status: 'AVAILABLE', expiresAt: { lt: now } }
        : query.state === 'AVAILABLE'
          ? { status: 'AVAILABLE', expiresAt: { gte: now } }
          : query.state
            ? { status: query.state }
            : {};
    const rows = await this.prisma.client.accessInvite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((invite) => toInviteView(invite, now)),
      nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async listUsers(query: ListAdminUsersQuery): Promise<ListAdminUsersResponse> {
    const rows = await this.prisma.client.user.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    const views = await this.toUserViews(page);
    return {
      items: views,
      nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async updateUser(
    adminId: string,
    userId: string,
    request: UpdateAdminUserRequest,
  ): Promise<UpdateAdminUserResponse> {
    const audited: string[] = [];
    await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status === 'DELETED') {
        throw new AdminError('NOT_FOUND', 'user not found');
      }

      if (request.monthlyWatchLimit !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { monthlyWatchLimit: request.monthlyWatchLimit },
        });
        await recordAdminAction(tx, {
          adminUserId: adminId,
          action: 'user_limit_changed',
          targetType: 'user',
          targetId: userId,
        });
        audited.push('user_limit_changed');
      }

      if (request.accessStatus && request.accessStatus !== user.accessStatus) {
        if (request.accessStatus === 'SUSPENDED') {
          // Suspender outro admin (ou a si mesmo) trancaria a administração.
          if (user.role === 'ADMIN') {
            throw new AdminError('INVALID_ADMIN_INPUT', 'an admin cannot be suspended');
          }
          await suspendUserAccess(tx, userId);
        } else {
          await tx.user.update({ where: { id: userId }, data: { accessStatus: 'ACTIVE' } });
        }
        const action = request.accessStatus === 'SUSPENDED' ? 'user_suspended' : 'user_reactivated';
        await recordAdminAction(tx, {
          adminUserId: adminId,
          action,
          targetType: 'user',
          targetId: userId,
        });
        audited.push(action);
      }
    });
    for (const action of audited) {
      this.metrics.adminActionsTotal.inc({ action });
    }

    const updated = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const [view] = await this.toUserViews([updated]);
    return { user: view as AdminUserView };
  }

  private async toUserViews(users: User[]): Promise<AdminUserView[]> {
    if (users.length === 0) {
      return [];
    }
    const ids = users.map((user) => user.id);
    const window = monthWindow(new Date());
    const [channels, created, active] = await Promise.all([
      this.prisma.client.notificationChannel.findMany({
        where: { userId: { in: ids }, type: 'EMAIL' },
        orderBy: { createdAt: 'asc' },
        select: { userId: true, verifiedAt: true },
      }),
      this.prisma.client.watch.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, createdAt: { gte: window.start } },
        _count: { _all: true },
      }),
      this.prisma.client.watch.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ]);
    const verified = new Map<string, boolean>();
    for (const channel of channels) {
      if (!verified.has(channel.userId)) {
        verified.set(channel.userId, channel.verifiedAt !== null);
      }
    }
    const createdBy = new Map(created.map((row) => [row.userId, row._count._all]));
    const activeBy = new Map(active.map((row) => [row.userId, row._count._all]));

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      emailVerified: verified.get(user.id) ?? false,
      role: user.role,
      accessStatus: user.accessStatus,
      monthlyWatchLimit: user.monthlyWatchLimit,
      effectiveMonthlyLimit:
        user.role === 'ADMIN' ? null : (user.monthlyWatchLimit ?? this.config.MONTHLY_WATCH_LIMIT),
      watchesCreatedThisMonth: createdBy.get(user.id) ?? 0,
      activeWatches: activeBy.get(user.id) ?? 0,
    }));
  }
}
