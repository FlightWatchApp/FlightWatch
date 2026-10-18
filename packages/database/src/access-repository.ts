import type { Prisma, UserAccessStatus, UserRole } from '@prisma/client';

/**
 * SPEC-043: tudo aqui recebe a transação do chamador — a checagem e a ação
 * (resgatar a chave e criar a conta, revogar e auditar) precisam acontecer na
 * mesma transação.
 */

export type ClaimAccessInviteResult =
  | { outcome: 'claimed'; inviteId: string }
  | { outcome: 'missing' | 'used' | 'revoked' | 'expired' | 'email_mismatch' };

interface InviteRow {
  id: string;
  email: string;
  status: 'AVAILABLE' | 'REDEEMED' | 'REVOKED';
  expiresAt: Date;
}

/**
 * Trava a linha da chave (`FOR UPDATE`) e confere se pode ser usada. Dois
 * cadastros simultâneos com a mesma chave: o segundo espera o primeiro
 * terminar e então a vê `REDEEMED`. O resgate em si é
 * `markAccessInviteRedeemed`, depois de criar o usuário.
 */
export async function claimAccessInvite(
  tx: Prisma.TransactionClient,
  params: { codeHash: string; email: string; now: Date },
): Promise<ClaimAccessInviteResult> {
  const rows = await tx.$queryRaw<InviteRow[]>`
    SELECT "id", "email", "status", "expiresAt"
    FROM "access_invites"
    WHERE "codeHash" = ${params.codeHash}
    FOR UPDATE`;
  const invite = rows[0];
  if (!invite) {
    return { outcome: 'missing' };
  }
  if (invite.status === 'REDEEMED') {
    return { outcome: 'used' };
  }
  if (invite.status === 'REVOKED') {
    return { outcome: 'revoked' };
  }
  if (invite.expiresAt.getTime() < params.now.getTime()) {
    return { outcome: 'expired' };
  }
  if (invite.email !== params.email) {
    return { outcome: 'email_mismatch' };
  }
  return { outcome: 'claimed', inviteId: invite.id };
}

export async function markAccessInviteRedeemed(
  tx: Prisma.TransactionClient,
  params: { inviteId: string; userId: string; now: Date },
): Promise<void> {
  await tx.accessInvite.update({
    where: { id: params.inviteId },
    data: { status: 'REDEEMED', redeemedAt: params.now, redeemedByUserId: params.userId },
  });
}

/**
 * Cria a chave; uma chave `AVAILABLE` anterior do mesmo e-mail passa a
 * `REVOKED` na mesma transação (vale sempre a última enviada).
 */
export async function createAccessInvite(
  tx: Prisma.TransactionClient,
  params: {
    codeHash: string;
    email: string;
    expiresAt: Date;
    createdByUserId: string | null;
  },
) {
  await tx.accessInvite.updateMany({
    where: { email: params.email, status: 'AVAILABLE' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  return tx.accessInvite.create({
    data: {
      codeHash: params.codeHash,
      email: params.email,
      expiresAt: params.expiresAt,
      createdByUserId: params.createdByUserId,
    },
  });
}

export type RevokeAccessInviteResult = 'revoked' | 'not_revocable' | 'not_found';

export async function revokeAccessInvite(
  tx: Prisma.TransactionClient,
  params: { inviteId: string; now: Date },
): Promise<RevokeAccessInviteResult> {
  const result = await tx.accessInvite.updateMany({
    where: { id: params.inviteId, status: 'AVAILABLE' },
    data: { status: 'REVOKED', revokedAt: params.now },
  });
  if (result.count === 1) {
    return 'revoked';
  }
  const exists = await tx.accessInvite.count({ where: { id: params.inviteId } });
  return exists > 0 ? 'not_revocable' : 'not_found';
}

export async function recordAdminAction(
  tx: Prisma.TransactionClient,
  params: { adminUserId: string | null; action: string; targetType: string; targetId: string },
): Promise<void> {
  await tx.adminAuditLog.create({ data: params });
}

export interface LockedUserForWatchCreation {
  role: UserRole;
  monthlyWatchLimit: number | null;
  accessStatus: UserAccessStatus;
}

/**
 * Primeiro passo da transação de criação de Watch: `FOR UPDATE` na linha da
 * pessoa serializa criações concorrentes dela, para as contagens seguintes
 * (cota mensal e ativos) não correrem.
 */
export async function lockUserForWatchCreation(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<LockedUserForWatchCreation | null> {
  const rows = await tx.$queryRaw<LockedUserForWatchCreation[]>`
    SELECT "role", "monthlyWatchLimit", "accessStatus"
    FROM "users"
    WHERE "id" = ${userId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

/** Watches criados desde `since`, em qualquer estado (cancelar não devolve a vaga). */
export function countWatchesCreatedSince(
  tx: Prisma.TransactionClient,
  userId: string,
  since: Date,
): Promise<number> {
  return tx.watch.count({ where: { userId, createdAt: { gte: since } } });
}

/**
 * SPEC-043 (CDC art. 49): marca o acesso como suspenso, pausa os Watches
 * ativos pela mesma transição do pausar (SPEC-008) e apaga as sessões.
 * Devolve quantos Watches foram pausados.
 */
export async function suspendUserAccess(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  await tx.user.update({ where: { id: userId }, data: { accessStatus: 'SUSPENDED' } });
  const paused = await tx.watch.updateMany({
    where: { userId, status: 'ACTIVE' },
    data: { status: 'PAUSED', version: { increment: 1 } },
  });
  await tx.session.deleteMany({ where: { userId } });
  return paused.count;
}
