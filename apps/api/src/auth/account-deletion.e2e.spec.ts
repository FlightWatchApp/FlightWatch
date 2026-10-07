import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** SPEC-027 — exclusão (anonimização) de conta, Postgres real. */
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

const PASSWORD = 'a-very-long-password-123';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService).client;
  // SPEC-029: rotas são validadas no catálogo de lugares.
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

function http() {
  return request(app.getHttpServer());
}

interface TestUser {
  userId: string;
  email: string;
  token: string;
  channelId: string;
}

async function createUserWithWatches(): Promise<TestUser & { watchIds: string[] }> {
  const email = `${randomUUID()}@example.com`;
  const registered = await http()
    .post('/v1/auth/register')
    .send({ email, password: PASSWORD, timezone: 'America/Campo_Grande' });
  expect(registered.status).toBe(201);
  const user: TestUser = {
    userId: registered.body.user.id,
    email,
    token: registered.body.token,
    channelId: registered.body.user.notificationChannelId,
  };
  await prisma.notificationChannel.update({
    where: { id: user.channelId },
    data: { verifiedAt: new Date() },
  });

  const watchIds: string[] = [];
  for (const departureDate of ['2027-03-01', '2027-03-02', '2027-03-03']) {
    const created = await http()
      .post('/v1/watches')
      .set('authorization', `Bearer ${user.token}`)
      .send({
        origin: 'DOU',
        destination: 'GRU',
        tripType: 'ONE_WAY',
        departureDate,
        returnDate: null,
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        alertRules: [{ type: 'TARGET_PRICE', amountMinor: 80000, cooldownSeconds: 43200 }],
        notificationChannelId: user.channelId,
      });
    expect(created.status).toBe(201);
    watchIds.push(created.body.id);
  }
  // Um pausado e um já encerrado, além do ativo.
  const [, pausedId, completedId] = watchIds;
  if (!pausedId || !completedId) throw new Error('watches não criados');
  await prisma.watch.update({ where: { id: pausedId }, data: { status: 'PAUSED' } });
  await prisma.watch.update({ where: { id: completedId }, data: { status: 'COMPLETED' } });
  return { ...user, watchIds };
}

function deleteAccount(token: string | null, password = PASSWORD) {
  const call = http().post('/v1/auth/delete-account');
  if (token) call.set('authorization', `Bearer ${token}`);
  return call.send({ password });
}

describe('POST /v1/auth/delete-account (SPEC-027)', () => {
  it('anonimiza a conta, revoga canais, cancela watches e encerra sessões', async () => {
    const user = await createUserWithWatches();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });

    const response = await deleteAccount(user.token);
    expect(response.status).toBe(204);

    // AC-1
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(after.status).toBe('DELETED');
    expect(after.email).toBe(`deleted-${user.userId}@deleted.invalid`);
    expect(after.timezone).toBe('UTC');
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordResetTokenHash).toBeNull();

    // AC-2
    expect(await prisma.session.count({ where: { userId: user.userId } })).toBe(0);
    const me = await http().get('/v1/auth/me').set('authorization', `Bearer ${user.token}`);
    expect(me.status).toBe(401);

    // AC-3
    const channel = await prisma.notificationChannel.findUniqueOrThrow({
      where: { id: user.channelId },
    });
    expect(channel.status).toBe('REVOKED');
    expect(channel.destination).toBe(`deleted-${channel.id}@deleted.invalid`);
    expect(channel.destination).not.toContain(user.email);
    expect(channel.verificationTokenHash).toBeNull();
    expect(channel.version).toBe(1);

    // AC-4
    const watches = await prisma.watch.findMany({ where: { id: { in: user.watchIds } } });
    const statusById = new Map(watches.map((watch) => [watch.id, watch.status]));
    // Ordem de criação: ativo, pausado, concluído.
    expect(user.watchIds.map((id) => statusById.get(id))).toEqual([
      'CANCELLED',
      'CANCELLED',
      'COMPLETED',
    ]);
  });

  // AC-5
  it('o e-mail antigo não entra mais e fica livre para um novo cadastro', async () => {
    const user = await createUserWithWatches();
    expect((await deleteAccount(user.token)).status).toBe(204);

    const login = await http()
      .post('/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(401);

    const again = await http()
      .post('/v1/auth/register')
      .send({ email: user.email, password: PASSWORD, timezone: 'America/Campo_Grande' });
    expect(again.status).toBe(201);
    expect(again.body.user.id).not.toBe(user.userId);
  });

  // AC-6
  it('senha errada responde 401, conta a tentativa e não apaga nada', async () => {
    const user = await createUserWithWatches();

    const response = await deleteAccount(user.token, 'wrong-password-000000');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(after.status).toBe('ACTIVE');
    expect(after.email).toBe(user.email);
    expect(after.failedLoginAttempts).toBe(1);
    expect(await prisma.session.count({ where: { userId: user.userId } })).toBe(1);
  });

  // AC-7
  it('exige sessão', async () => {
    const response = await deleteAccount(null);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  // AC-8
  it('não afeta outra conta', async () => {
    const target = await createUserWithWatches();
    const other = await createUserWithWatches();

    expect((await deleteAccount(target.token)).status).toBe(204);

    const otherUser = await prisma.user.findUniqueOrThrow({ where: { id: other.userId } });
    expect(otherUser.status).toBe('ACTIVE');
    expect(otherUser.email).toBe(other.email);
    const otherChannel = await prisma.notificationChannel.findUniqueOrThrow({
      where: { id: other.channelId },
    });
    expect(otherChannel.status).toBe('ACTIVE');
    const otherActive = await prisma.watch.count({
      where: { userId: other.userId, status: 'ACTIVE' },
    });
    expect(otherActive).toBe(1);
    const me = await http().get('/v1/auth/me').set('authorization', `Bearer ${other.token}`);
    expect(me.status).toBe(200);
  });
});
