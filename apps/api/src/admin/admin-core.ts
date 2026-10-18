import { AdminError } from '@flight-watch/contracts';
import {
  createAccessInvite,
  recordAdminAction,
  revokeAccessInvite,
  type PrismaClient,
} from '@flight-watch/database';
import { formatInviteCode, generateInviteCode, normalizeInviteCode } from '@flight-watch/domain';
import { hashOpaqueToken } from '../auth/opaque-token.js';

/**
 * SPEC-043: regras de admin que o site e o comando no servidor compartilham.
 * Sem Nest aqui — o comando (`cli/admin.ts`) usa estas funções direto. Cada
 * ação grava a auditoria na mesma transação.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Quem agiu: o id do admin, ou null para o comando no servidor. */
export type AdminActor = string | null;

export interface IssuedInvite {
  inviteId: string;
  email: string;
  /** Chave formatada em grupos de 5; só existe aqui, nunca no banco. */
  code: string;
  expiresAt: Date;
}

export async function issueInvite(
  prisma: PrismaClient,
  params: {
    email: string;
    ttlDays: number;
    actor: AdminActor;
    action: 'invite_created' | 'invite_resent';
    now: Date;
  },
): Promise<IssuedInvite> {
  const normalized = generateInviteCode();
  const expiresAt = new Date(params.now.getTime() + params.ttlDays * MS_PER_DAY);
  const invite = await prisma.$transaction(async (tx) => {
    const holder = await tx.user.findUnique({
      where: { email: params.email },
      select: { id: true },
    });
    if (holder) {
      throw new AdminError('INVITE_EMAIL_TAKEN', 'this email already has an account');
    }
    const created = await createAccessInvite(tx, {
      codeHash: hashOpaqueToken(normalizeInviteCode(normalized)),
      email: params.email,
      expiresAt,
      createdByUserId: params.actor,
    });
    await recordAdminAction(tx, {
      adminUserId: params.actor,
      action: params.action,
      targetType: 'invite',
      targetId: created.id,
    });
    return created;
  });
  return {
    inviteId: invite.id,
    email: invite.email,
    code: formatInviteCode(normalized),
    expiresAt,
  };
}

export async function revokeInvite(
  prisma: PrismaClient,
  params: { inviteId: string; actor: AdminActor; now: Date },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await revokeAccessInvite(tx, { inviteId: params.inviteId, now: params.now });
    if (result === 'not_found') {
      throw new AdminError('NOT_FOUND', 'invite not found');
    }
    if (result === 'not_revocable') {
      throw new AdminError('INVITE_NOT_REVOCABLE', 'only an available invite can be revoked');
    }
    await recordAdminAction(tx, {
      adminUserId: params.actor,
      action: 'invite_revoked',
      targetType: 'invite',
      targetId: params.inviteId,
    });
  });
}

/** Papel só muda pelo comando no servidor (`actor` sempre null). */
export async function changeUserRole(
  prisma: PrismaClient,
  params: { email: string; role: 'USER' | 'ADMIN' },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: params.email } });
    if (!user || user.status === 'DELETED') {
      throw new AdminError('NOT_FOUND', 'user not found');
    }
    await tx.user.update({ where: { id: user.id }, data: { role: params.role } });
    await recordAdminAction(tx, {
      adminUserId: null,
      action: params.role === 'ADMIN' ? 'user_promoted' : 'user_demoted',
      targetType: 'user',
      targetId: user.id,
    });
  });
}
