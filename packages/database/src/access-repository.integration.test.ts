import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  claimAccessInvite,
  countWatchesCreatedSince,
  createAccessInvite,
  lockUserForWatchCreation,
  markAccessInviteRedeemed,
  recordAdminAction,
  revokeAccessInvite,
  suspendUserAccess,
} from './access-repository.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasourceUrl: container.getConnectionUri() });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

const NOW = new Date('2026-10-17T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

async function newInvite(overrides: { email?: string; expiresAt?: Date } = {}) {
  const codeHash = `hash-${randomUUID()}`;
  const email = overrides.email ?? `${randomUUID()}@example.com`;
  await prisma.$transaction((tx) =>
    createAccessInvite(tx, {
      codeHash,
      email,
      expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 30 * DAY),
      createdByUserId: null,
    }),
  );
  return { codeHash, email };
}

async function registerWithInvite(codeHash: string, email: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await claimAccessInvite(tx, { codeHash, email, now: NOW });
    if (claim.outcome !== 'claimed') {
      return claim;
    }
    const user = await tx.user.create({
      data: { email, timezone: 'America/Campo_Grande', passwordHash: 'x', status: 'ACTIVE' },
    });
    await markAccessInviteRedeemed(tx, { inviteId: claim.inviteId, userId: user.id, now: NOW });
    return claim;
  });
}

describe('claimAccessInvite', () => {
  it('AC-3: dois cadastros simultâneos com a mesma chave criam exatamente uma conta', async () => {
    const { codeHash, email } = await newInvite();
    const results = await Promise.allSettled([
      registerWithInvite(codeHash, email),
      registerWithInvite(codeHash, email),
    ]);
    const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value.outcome : 'error'));
    expect(outcomes.filter((o) => o === 'claimed')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'used')).toHaveLength(1);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it.each([
    ['chave inexistente', 'missing'],
    ['e-mail diferente', 'email_mismatch'],
    ['vencida', 'expired'],
    ['revogada', 'revoked'],
    ['já usada', 'used'],
  ])('recusa %s com o motivo %s', async (label, expected) => {
    const base = await newInvite(
      label === 'vencida' ? { expiresAt: new Date(NOW.getTime() - 1) } : {},
    );
    let codeHash = base.codeHash;
    let email = base.email;
    if (label === 'chave inexistente') codeHash = 'hash-que-nao-existe';
    if (label === 'e-mail diferente') email = 'outra@example.com';
    if (label === 'revogada') {
      const invite = await prisma.accessInvite.findUniqueOrThrow({ where: { codeHash } });
      await prisma.$transaction((tx) => revokeAccessInvite(tx, { inviteId: invite.id, now: NOW }));
    }
    if (label === 'já usada') {
      expect((await registerWithInvite(codeHash, email)).outcome).toBe('claimed');
    }
    const result = await prisma.$transaction((tx) =>
      claimAccessInvite(tx, { codeHash, email, now: NOW }),
    );
    expect(result.outcome).toBe(expected);
  });
});

describe('createAccessInvite', () => {
  it('revoga a chave disponível anterior do mesmo e-mail', async () => {
    const first = await newInvite();
    await prisma.$transaction((tx) =>
      createAccessInvite(tx, {
        codeHash: `hash-${randomUUID()}`,
        email: first.email,
        expiresAt: new Date(NOW.getTime() + DAY),
        createdByUserId: null,
      }),
    );
    const old = await prisma.accessInvite.findUniqueOrThrow({
      where: { codeHash: first.codeHash },
    });
    expect(old.status).toBe('REVOKED');
    expect(old.revokedAt).not.toBeNull();
  });
});

describe('revokeAccessInvite', () => {
  it('não revoga chave já usada', async () => {
    const { codeHash, email } = await newInvite();
    await registerWithInvite(codeHash, email);
    const invite = await prisma.accessInvite.findUniqueOrThrow({ where: { codeHash } });
    const result = await prisma.$transaction((tx) =>
      revokeAccessInvite(tx, { inviteId: invite.id, now: NOW }),
    );
    expect(result).toBe('not_revocable');
  });
});

describe('cota mensal (AC-9)', () => {
  async function userWithWatches(count: number) {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        timezone: 'America/Campo_Grande',
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    const channel = await prisma.notificationChannel.create({
      data: { userId: user.id, type: 'EMAIL', destination: user.email, status: 'ACTIVE' },
    });
    const target = await prisma.searchTarget.create({
      data: {
        fingerprint: `fp-${randomUUID()}`,
        canonicalKey: `canonical-${randomUUID()}`,
        originIata: 'DOU',
        destinationIata: 'GRU',
        departureDate: new Date('2027-03-01'),
        tripType: 'ONE_WAY',
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        checkIntervalSeconds: 14_400,
        status: 'ACTIVE',
      },
    });
    for (let i = 0; i < count; i += 1) {
      await prisma.watch.create({
        data: {
          userId: user.id,
          searchTargetId: target.id,
          notificationChannelId: channel.id,
          startsAt: NOW,
          createdAt: NOW,
        },
      });
    }
    return { user, channel, target };
  }

  async function createIfRoom(ctx: Awaited<ReturnType<typeof userWithWatches>>, limit: number) {
    return prisma.$transaction(async (tx) => {
      await lockUserForWatchCreation(tx, ctx.user.id);
      const used = await countWatchesCreatedSince(tx, ctx.user.id, new Date('2026-10-01'));
      if (used >= limit) {
        return false;
      }
      await tx.watch.create({
        data: {
          userId: ctx.user.id,
          searchTargetId: ctx.target.id,
          notificationChannelId: ctx.channel.id,
          startsAt: NOW,
          createdAt: NOW,
        },
      });
      return true;
    });
  }

  it('duas criações simultâneas com 1 vaga restante: exatamente uma passa', async () => {
    const ctx = await userWithWatches(4);
    const results = await Promise.all([createIfRoom(ctx, 5), createIfRoom(ctx, 5)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.watch.count({ where: { userId: ctx.user.id } })).toBe(5);
  });

  it('conta Watches em qualquer estado, inclusive cancelados', async () => {
    const ctx = await userWithWatches(2);
    await prisma.watch.updateMany({
      where: { userId: ctx.user.id },
      data: { status: 'CANCELLED' },
    });
    const used = await prisma.$transaction((tx) =>
      countWatchesCreatedSince(tx, ctx.user.id, new Date('2026-10-01')),
    );
    expect(used).toBe(2);
  });

  it('lockUserForWatchCreation devolve papel, cota própria e acesso', async () => {
    const ctx = await userWithWatches(0);
    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { role: 'ADMIN', monthlyWatchLimit: 9 },
    });
    const locked = await prisma.$transaction((tx) => lockUserForWatchCreation(tx, ctx.user.id));
    expect(locked).toEqual({ role: 'ADMIN', monthlyWatchLimit: 9, accessStatus: 'ACTIVE' });
  });

  it('suspendUserAccess pausa Watches ativos e apaga sessões (AC-10)', async () => {
    const ctx = await userWithWatches(2);
    await prisma.session.create({
      data: {
        userId: ctx.user.id,
        tokenHash: `t-${randomUUID()}`,
        expiresAt: new Date(NOW.getTime() + DAY),
      },
    });
    const paused = await prisma.$transaction((tx) => suspendUserAccess(tx, ctx.user.id));
    expect(paused).toBe(2);
    expect(await prisma.watch.count({ where: { userId: ctx.user.id, status: 'PAUSED' } })).toBe(2);
    expect(await prisma.session.count({ where: { userId: ctx.user.id } })).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    expect(user.accessStatus).toBe('SUSPENDED');
  });
});

describe('recordAdminAction', () => {
  it('grava só ids e ação', async () => {
    await prisma.$transaction((tx) =>
      recordAdminAction(tx, {
        adminUserId: null,
        action: 'invite_created',
        targetType: 'invite',
        targetId: 'abc',
      }),
    );
    const row = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: 'abc' } });
    expect(Object.keys(row).sort()).toEqual(
      ['action', 'adminUserId', 'createdAt', 'id', 'targetId', 'targetType'].sort(),
    );
  });
});
