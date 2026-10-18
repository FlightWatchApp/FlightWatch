import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PrismaClient, TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import { generateInviteCode, formatInviteCode, normalizeInviteCode } from '@flight-watch/domain';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashOpaqueToken } from './opaque-token.js';

// SPEC-043: tudo aqui roda com INVITE_REQUIRED=true e cota mensal de 2.
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.INVITE_REQUIRED = 'true';
  process.env.MONTHLY_WATCH_LIMIT = '2';

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
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  delete process.env.INVITE_REQUIRED;
  delete process.env.MONTHLY_WATCH_LIMIT;
  await app?.close();
  await container?.stop();
});

const INVALID_MESSAGE =
  'Chave de acesso inválida, vencida ou já usada. Confira o e-mail em que você recebeu a chave.';

async function createInvite(
  email: string,
  overrides: { expiresAt?: Date; status?: 'AVAILABLE' | 'REVOKED' | 'REDEEMED' } = {},
) {
  const code = generateInviteCode();
  await prisma.accessInvite.create({
    data: {
      codeHash: hashOpaqueToken(normalizeInviteCode(code)),
      email,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
      status: overrides.status ?? 'AVAILABLE',
    },
  });
  return code;
}

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `${randomUUID()}@example.com`,
    password: 'a-very-long-password-123',
    timezone: 'America/Campo_Grande',
    ...overrides,
  };
}

function register(body: Record<string, unknown>) {
  return request(app.getHttpServer()).post('/v1/auth/register').send(body);
}

describe('GET /v1/auth/registration', () => {
  it('informa que a chave é exigida', async () => {
    const response = await request(app.getHttpServer()).get('/v1/auth/registration');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ inviteRequired: true });
  });
});

describe('POST /v1/auth/register com INVITE_REQUIRED=true', () => {
  it('cria a conta com chave válida (com hífen, minúscula) e marca a chave como usada', async () => {
    const body = registerBody();
    const code = await createInvite(body.email);

    const response = await register({
      ...body,
      inviteCode: formatInviteCode(normalizeInviteCode(code)).toLowerCase(),
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('USER');
    const invite = await prisma.accessInvite.findFirstOrThrow({ where: { email: body.email } });
    expect(invite.status).toBe('REDEEMED');
    expect(invite.redeemedByUserId).toBe(response.body.user.id);
    expect(invite.redeemedAt).not.toBeNull();
  });

  // AC-1
  it.each([
    ['sem chave', async () => ({ inviteCode: undefined })],
    ['chave errada', async () => ({ inviteCode: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' })],
  ])('recusa %s com INVITE_INVALID e a mensagem única', async (_label, build) => {
    const response = await register(registerBody(await build()));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVITE_INVALID', message: INVALID_MESSAGE });
  });

  it.each([
    ['vencida', { expiresAt: new Date(Date.now() - 1000) }],
    ['revogada', { status: 'REVOKED' as const }],
    ['já usada', { status: 'REDEEMED' as const }],
  ])('recusa chave %s com INVITE_INVALID e a mesma mensagem', async (_label, overrides) => {
    const body = registerBody();
    const code = await createInvite(body.email, overrides);
    const response = await register({ ...body, inviteCode: code });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVITE_INVALID', message: INVALID_MESSAGE });
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(0);
  });

  // AC-2
  it('recusa chave válida com outro e-mail', async () => {
    const code = await createInvite(`${randomUUID()}@example.com`);
    const response = await register(registerBody({ inviteCode: code }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVITE_INVALID');
  });

  it('não revela e-mail já cadastrado a quem não tem chave válida', async () => {
    const existing = registerBody();
    const code = await createInvite(existing.email);
    expect((await register({ ...existing, inviteCode: code })).status).toBe(201);

    const response = await register({ ...existing, inviteCode: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVITE_INVALID');
  });

  // AC-3 (via HTTP)
  it('dois cadastros simultâneos com a mesma chave criam uma conta só', async () => {
    const body = registerBody();
    const code = await createInvite(body.email);
    const responses = await Promise.all([
      register({ ...body, inviteCode: code }),
      register({ ...body, inviteCode: code }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(1);
  });

  // AC-4
  it('não grava a chave em claro em nenhuma tabela', async () => {
    const body = registerBody();
    const code = await createInvite(body.email);
    await register({ ...body, inviteCode: code });
    const normalized = normalizeInviteCode(code);
    const dump = JSON.stringify({
      invites: await prisma.accessInvite.findMany(),
      audit: await prisma.adminAuditLog.findMany(),
    });
    expect(dump).not.toContain(normalized);
    expect(dump).not.toContain(code);
  });
});

describe('login de conta suspensa', () => {
  // AC-10 (parte do login)
  it('responde 403 ACCESS_SUSPENDED com a senha certa', async () => {
    const body = registerBody();
    const code = await createInvite(body.email);
    const created = await register({ ...body, inviteCode: code });
    await prisma.user.update({
      where: { id: created.body.user.id },
      data: { accessStatus: 'SUSPENDED' },
    });

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: body.email, password: body.password });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ACCESS_SUSPENDED');
  });
});

describe('cota mensal de monitoramentos', () => {
  async function verifiedUser(overrides: Record<string, unknown> = {}) {
    const body = registerBody();
    const created = await register({ ...body, inviteCode: await createInvite(body.email) });
    await prisma.notificationChannel.update({
      where: { id: created.body.user.notificationChannelId },
      data: { verifiedAt: new Date() },
    });
    if (Object.keys(overrides).length > 0) {
      await prisma.user.update({ where: { id: created.body.user.id }, data: overrides });
    }
    return {
      userId: created.body.user.id as string,
      channelId: created.body.user.notificationChannelId as string,
      token: created.body.token as string,
    };
  }

  function createWatch(user: { channelId: string; token: string }, departureDate = '2026-12-20') {
    return request(app.getHttpServer())
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
        notificationChannelId: user.channelId,
      });
  }

  // AC-8
  it('bloqueia a criação além do limite e cancelar não devolve a vaga', async () => {
    const user = await verifiedUser();
    const first = await createWatch(user, '2026-12-20');
    expect(first.status).toBe(201);
    expect((await createWatch(user, '2026-12-21')).status).toBe(201);

    await request(app.getHttpServer())
      .post(`/v1/watches/${first.body.id}/cancel`)
      .set('authorization', `Bearer ${user.token}`);

    const blocked = await createWatch(user, '2026-12-22');
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('WATCH_MONTHLY_LIMIT_REACHED');
    expect(blocked.body.details).toMatchObject({ limit: 2, used: 2 });
    expect(new Date(blocked.body.details.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('usa o monthlyWatchLimit da pessoa no lugar do padrão', async () => {
    const user = await verifiedUser({ monthlyWatchLimit: 3 });
    for (const day of ['20', '21', '22']) {
      expect((await createWatch(user, `2026-12-${day}`)).status).toBe(201);
    }
    expect((await createWatch(user, '2026-12-23')).status).toBe(409);
  });

  it('admin não tem cota mensal', async () => {
    const user = await verifiedUser({ role: 'ADMIN' });
    for (const day of ['20', '21', '22']) {
      expect((await createWatch(user, `2026-12-${day}`)).status).toBe(201);
    }
  });

  it('mês seguinte libera: Watches de meses anteriores não contam', async () => {
    const user = await verifiedUser();
    await createWatch(user, '2026-12-20');
    await createWatch(user, '2026-12-21');
    await prisma.watch.updateMany({
      where: { userId: user.userId },
      data: { createdAt: new Date('2020-01-15T12:00:00Z') },
    });
    expect((await createWatch(user, '2026-12-22')).status).toBe(201);
  });

  // AC-9 (via HTTP)
  it('duas criações simultâneas com 1 vaga restante: exatamente uma passa', async () => {
    const user = await verifiedUser();
    expect((await createWatch(user, '2026-12-20')).status).toBe(201);
    const responses = await Promise.all([
      createWatch(user, '2026-12-21'),
      createWatch(user, '2026-12-22'),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('conta suspensa não cria monitoramento nem com uma sessão que sobrou', async () => {
    const user = await verifiedUser({ accessStatus: 'SUSPENDED' });
    const response = await createWatch(user);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  // AC-12
  it('GET /v1/me/overview traz watchQuota', async () => {
    const user = await verifiedUser();
    await createWatch(user, '2026-12-20');
    const response = await request(app.getHttpServer())
      .get('/v1/me/overview')
      .set('authorization', `Bearer ${user.token}`);
    expect(response.status).toBe(200);
    expect(response.body.watchQuota).toMatchObject({ used: 1, limit: 2 });
    expect(typeof response.body.watchQuota.resetsAt).toBe('string');
  });

  it('watchQuota.limit é null para admin', async () => {
    const user = await verifiedUser({ role: 'ADMIN' });
    const response = await request(app.getHttpServer())
      .get('/v1/me/overview')
      .set('authorization', `Bearer ${user.token}`);
    expect(response.body.watchQuota).toMatchObject({ used: 0, limit: null });
  });
});
