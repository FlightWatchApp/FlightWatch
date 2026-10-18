import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type PrismaClient, TEST_PLACES, syncPlacesCatalog } from '@flight-watch/database';
import { InMemoryEmailSender } from '@flight-watch/notifications';
import { AppModule } from '../app.module.js';
import { changeUserRole } from './admin-core.js';
import { EMAIL_SENDER } from '../auth/email-sender.token.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// SPEC-043 — API de admin, com INVITE_REQUIRED=true.
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let metrics: MetricsService;
let emailSender: InMemoryEmailSender;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.INVITE_REQUIRED = 'true';
  process.env.WEB_BASE_URL = 'https://flightwatch.example';

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
  metrics = app.get(MetricsService);
  emailSender = app.get(EMAIL_SENDER);
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterEach(() => {
  emailSender.sent.length = 0;
});

afterAll(async () => {
  delete process.env.INVITE_REQUIRED;
  delete process.env.WEB_BASE_URL;
  await app?.close();
  await container?.stop();
});

const server = () => app.getHttpServer();

/** Cria a conta direto no banco (o convite é o assunto dos testes, não o setup). */
async function createAccount(role: 'USER' | 'ADMIN' = 'USER') {
  const email = `${randomUUID()}@example.com`;
  const { hashPassword } = await import('../auth/password-hash.js');
  const { generateOpaqueToken, hashOpaqueToken } = await import('../auth/opaque-token.js');
  const user = await prisma.user.create({
    data: {
      email,
      status: 'ACTIVE',
      timezone: 'America/Campo_Grande',
      passwordHash: await hashPassword('a-very-long-password-123'),
      role,
    },
  });
  const channel = await prisma.notificationChannel.create({
    data: {
      userId: user.id,
      type: 'EMAIL',
      destination: email,
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
  });
  const token = generateOpaqueToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return { userId: user.id, email, channelId: channel.id, token };
}

const asAuth = (token: string): [string, string] => ['authorization', `Bearer ${token}`];

async function newInvite(admin: { token: string }, email = `${randomUUID()}@example.com`) {
  const response = await request(server())
    .post('/v1/admin/invites')
    .set(...asAuth(admin.token))
    .send({ email });
  return { response, email };
}

describe('autorização (AC-6)', () => {
  const routes: Array<[string, string]> = [
    ['post', '/v1/admin/invites'],
    ['get', '/v1/admin/invites'],
    ['post', `/v1/admin/invites/${randomUUID()}/revoke`],
    ['post', `/v1/admin/invites/${randomUUID()}/resend`],
    ['get', '/v1/admin/users'],
    ['patch', `/v1/admin/users/${randomUUID()}`],
  ];

  function call(method: string, url: string, token?: string): request.Test {
    const agent = request(server());
    const test =
      method === 'post' ? agent.post(url) : method === 'patch' ? agent.patch(url) : agent.get(url);
    return token ? test.set(...asAuth(token)) : test;
  }

  it.each(routes)('%s %s: 404 para quem não é admin', async (method, url) => {
    const user = await createAccount('USER');
    const response = await call(method, url, user.token).send({});
    expect(response.status).toBe(404);
  });

  it.each(routes)('%s %s: 404 também sem sessão', async (method, url) => {
    const response = await call(method, url).send({});
    expect(response.status).toBe(404);
  });

  it('admin rebaixado perde o acesso na requisição seguinte', async () => {
    const admin = await createAccount('ADMIN');
    const ok = await request(server())
      .get('/v1/admin/invites')
      .set(...asAuth(admin.token));
    expect(ok.status).toBe(200);

    await prisma.user.update({ where: { id: admin.userId }, data: { role: 'USER' } });

    const denied = await request(server())
      .get('/v1/admin/invites')
      .set(...asAuth(admin.token));
    expect(denied.status).toBe(404);
  });
});

describe('comando no servidor (changeUserRole)', () => {
  it('promove, dá acesso ao admin, rebaixa e audita sem admin', async () => {
    const person = await createAccount('USER');
    await changeUserRole(prisma, { email: person.email, role: 'ADMIN' });
    const ok = await request(server())
      .get('/v1/admin/users')
      .set(...asAuth(person.token));
    expect(ok.status).toBe(200);

    await changeUserRole(prisma, { email: person.email, role: 'USER' });
    const denied = await request(server())
      .get('/v1/admin/users')
      .set(...asAuth(person.token));
    expect(denied.status).toBe(404);

    const audit = await prisma.adminAuditLog.findMany({ where: { targetId: person.userId } });
    expect(audit.map((a) => [a.action, a.adminUserId])).toEqual([
      ['user_promoted', null],
      ['user_demoted', null],
    ]);
  });

  it('e-mail inexistente: NOT_FOUND', async () => {
    await expect(
      changeUserRole(prisma, { email: 'ninguem@example.com', role: 'ADMIN' }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});

describe('convites', () => {
  it('cria a chave, devolve uma vez, envia o e-mail e audita (AC-4, AC-7)', async () => {
    const admin = await createAccount('ADMIN');
    const { response, email } = await newInvite(admin);

    expect(response.status).toBe(201);
    expect(response.body.code).toMatch(/^([2-9A-Z]{5}-){4}[2-9A-Z]{5}$/);
    expect(response.body.invite).toMatchObject({ email, state: 'AVAILABLE' });
    expect(response.body.emailSent).toBe(true);
    expect(JSON.stringify(response.body.invite)).not.toContain('codeHash');

    const stored = await prisma.accessInvite.findFirstOrThrow({ where: { email } });
    expect(stored.createdByUserId).toBe(admin.userId);
    const plain = (response.body.code as string).replaceAll('-', '');
    expect(JSON.stringify(stored)).not.toContain(plain);

    const mail = emailSent(email);
    if (!mail) throw new Error('e-mail da chave não foi enviado');
    expect(mail.subject).toBe('Sua chave de acesso ao Flight Watch');
    expect(mail.textBody).toContain(response.body.code);
    expect(mail.textBody).toContain(
      `https://flightwatch.example/register#convite=${plain}&email=${encodeURIComponent(email)}`,
    );

    const audit = await prisma.adminAuditLog.findMany({ where: { targetId: stored.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      adminUserId: admin.userId,
      action: 'invite_created',
      targetType: 'invite',
    });
    expect(JSON.stringify(await prisma.adminAuditLog.findMany())).not.toContain(plain);
  });

  it('a chave gerada permite o cadastro e o e-mail com link bate com o cadastro', async () => {
    const admin = await createAccount('ADMIN');
    const { response, email } = await newInvite(admin);
    const registered = await request(server()).post('/v1/auth/register').send({
      email,
      password: 'a-very-long-password-123',
      timezone: 'America/Campo_Grande',
      inviteCode: response.body.code,
    });
    expect(registered.status).toBe(201);

    const list = await request(server())
      .get('/v1/admin/invites?state=REDEEMED')
      .set(...asAuth(admin.token));
    expect(list.body.items.some((i: { email: string }) => i.email === email)).toBe(true);
  });

  it('e-mail que já tem conta: 409 INVITE_EMAIL_TAKEN', async () => {
    const admin = await createAccount('ADMIN');
    const other = await createAccount('USER');
    const { response } = await newInvite(admin, other.email);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVITE_EMAIL_TAKEN');
  });

  it('nova chave para o mesmo e-mail revoga a anterior', async () => {
    const admin = await createAccount('ADMIN');
    const first = await newInvite(admin);
    const second = await newInvite(admin, first.email);
    const rows = await prisma.accessInvite.findMany({ where: { email: first.email } });
    expect(rows.filter((r) => r.status === 'AVAILABLE')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'REVOKED')).toHaveLength(1);
    expect(second.response.status).toBe(201);
  });

  it('falha no envio não desfaz a chave', async () => {
    const admin = await createAccount('ADMIN');
    const spy = vi.spyOn(emailSender, 'send').mockRejectedValueOnce(new Error('smtp fora'));
    try {
      const { response, email } = await newInvite(admin);
      expect(response.status).toBe(201);
      expect(response.body.emailSent).toBe(false);
      expect(response.body.code).toEqual(expect.any(String));
      expect(await prisma.accessInvite.count({ where: { email } })).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('revoga e não revoga chave já usada (409)', async () => {
    const admin = await createAccount('ADMIN');
    const { response } = await newInvite(admin);
    const revoked = await request(server())
      .post(`/v1/admin/invites/${response.body.invite.id}/revoke`)
      .set(...asAuth(admin.token));
    expect(revoked.status).toBe(201);
    expect(revoked.body.invite.state).toBe('REVOKED');

    const used = await newInvite(admin);
    await prisma.accessInvite.update({
      where: { id: used.response.body.invite.id },
      data: { status: 'REDEEMED', redeemedAt: new Date() },
    });
    const conflict = await request(server())
      .post(`/v1/admin/invites/${used.response.body.invite.id}/revoke`)
      .set(...asAuth(admin.token));
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('INVITE_NOT_REVOCABLE');
  });

  it('reenviar gera chave nova, revoga a antiga e manda e-mail', async () => {
    const admin = await createAccount('ADMIN');
    const { response, email } = await newInvite(admin);
    emailSender.sent.length = 0;

    const resent = await request(server())
      .post(`/v1/admin/invites/${response.body.invite.id}/resend`)
      .set(...asAuth(admin.token));

    expect(resent.status).toBe(201);
    expect(resent.body.code).not.toBe(response.body.code);
    expect(emailSent(email)?.textBody).toContain(resent.body.code);
    const old = await prisma.accessInvite.findUniqueOrThrow({
      where: { id: response.body.invite.id },
    });
    expect(old.status).toBe('REVOKED');
    const actions = (await prisma.adminAuditLog.findMany({ where: { adminUserId: admin.userId } }))
      .map((a) => a.action)
      .sort();
    expect(actions).toContain('invite_resent');
  });

  it('lista com estado derivado (vencida) e paginação por cursor', async () => {
    const admin = await createAccount('ADMIN');
    const expired = await newInvite(admin);
    await prisma.accessInvite.update({
      where: { id: expired.response.body.invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await newInvite(admin);
    await newInvite(admin);

    const page1 = await request(server())
      .get('/v1/admin/invites?limit=2')
      .set(...asAuth(admin.token));
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toEqual(expect.any(String));
    const page2 = await request(server())
      .get(`/v1/admin/invites?limit=2&cursor=${page1.body.nextCursor}`)
      .set(...asAuth(admin.token));
    expect(page2.body.items.length).toBeGreaterThan(0);

    const onlyExpired = await request(server())
      .get('/v1/admin/invites?state=EXPIRED')
      .set(...asAuth(admin.token));
    const ids = onlyExpired.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(expired.response.body.invite.id);
    expect(onlyExpired.body.items.every((i: { state: string }) => i.state === 'EXPIRED')).toBe(
      true,
    );
  });

  it('conta métricas sem expor a chave', async () => {
    const admin = await createAccount('ADMIN');
    await newInvite(admin);
    const text = await metrics.registry.metrics();
    expect(text).toContain('access_invites_total{source="admin",result="created"}');
    expect(text).toContain('admin_actions_total{action="invite_created"}');
  });
});

describe('pessoas', () => {
  it('lista com cota do mês, ativos e acesso', async () => {
    const admin = await createAccount('ADMIN');
    const person = await createAccount('USER');
    const response = await request(server())
      .get('/v1/admin/users?limit=100')
      .set(...asAuth(admin.token));
    expect(response.status).toBe(200);
    const row = response.body.items.find((u: { id: string }) => u.id === person.userId);
    expect(row).toMatchObject({
      email: person.email,
      role: 'USER',
      accessStatus: 'ACTIVE',
      emailVerified: true,
      monthlyWatchLimit: null,
      effectiveMonthlyLimit: 5,
      watchesCreatedThisMonth: 0,
      activeWatches: 0,
    });
  });

  it('altera a cota da pessoa e volta ao padrão com null', async () => {
    const admin = await createAccount('ADMIN');
    const person = await createAccount('USER');
    const changed = await request(server())
      .patch(`/v1/admin/users/${person.userId}`)
      .set(...asAuth(admin.token))
      .send({ monthlyWatchLimit: 8 });
    expect(changed.status).toBe(200);
    expect(changed.body.user).toMatchObject({ monthlyWatchLimit: 8, effectiveMonthlyLimit: 8 });

    const reset = await request(server())
      .patch(`/v1/admin/users/${person.userId}`)
      .set(...asAuth(admin.token))
      .send({ monthlyWatchLimit: null });
    expect(reset.body.user).toMatchObject({ monthlyWatchLimit: null, effectiveMonthlyLimit: 5 });

    const audit = await prisma.adminAuditLog.findMany({ where: { targetId: person.userId } });
    expect(audit.map((a) => a.action)).toEqual(['user_limit_changed', 'user_limit_changed']);
  });

  // AC-10
  it('suspender pausa os Watches ativos, apaga as sessões e bloqueia o login', async () => {
    const admin = await createAccount('ADMIN');
    const person = await createAccount('USER');
    const watchResponse = await request(server())
      .post('/v1/watches')
      .set(...asAuth(person.token))
      .send({
        origin: 'DOU',
        destination: 'GRU',
        tripType: 'ONE_WAY',
        departureDate: '2026-12-20',
        returnDate: null,
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        notificationChannelId: person.channelId,
      });
    expect(watchResponse.status).toBe(201);

    const suspended = await request(server())
      .patch(`/v1/admin/users/${person.userId}`)
      .set(...asAuth(admin.token))
      .send({ accessStatus: 'SUSPENDED' });
    expect(suspended.status).toBe(200);
    expect(suspended.body.user.accessStatus).toBe('SUSPENDED');

    const watch = await prisma.watch.findUniqueOrThrow({ where: { id: watchResponse.body.id } });
    expect(watch.status).toBe('PAUSED');
    expect(await prisma.session.count({ where: { userId: person.userId } })).toBe(0);

    const login = await request(server())
      .post('/v1/auth/login')
      .send({ email: person.email, password: 'a-very-long-password-123' });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCESS_SUSPENDED');

    // Reativar não retoma os Watches sozinho.
    const reactivated = await request(server())
      .patch(`/v1/admin/users/${person.userId}`)
      .set(...asAuth(admin.token))
      .send({ accessStatus: 'ACTIVE' });
    expect(reactivated.body.user.accessStatus).toBe('ACTIVE');
    expect((await prisma.watch.findUniqueOrThrow({ where: { id: watch.id } })).status).toBe(
      'PAUSED',
    );

    const actions = (
      await prisma.adminAuditLog.findMany({ where: { targetId: person.userId } })
    ).map((a) => a.action);
    expect(actions).toEqual(['user_suspended', 'user_reactivated']);
  });

  it('não suspende outro admin e responde 404 para pessoa inexistente', async () => {
    const admin = await createAccount('ADMIN');
    const other = await createAccount('ADMIN');
    const blocked = await request(server())
      .patch(`/v1/admin/users/${other.userId}`)
      .set(...asAuth(admin.token))
      .send({ accessStatus: 'SUSPENDED' });
    expect(blocked.status).toBe(400);

    const missing = await request(server())
      .patch(`/v1/admin/users/${randomUUID()}`)
      .set(...asAuth(admin.token))
      .send({ accessStatus: 'SUSPENDED' });
    expect(missing.status).toBe(404);
  });

  it('corpo vazio ou inválido: 400', async () => {
    const admin = await createAccount('ADMIN');
    const person = await createAccount('USER');
    const response = await request(server())
      .patch(`/v1/admin/users/${person.userId}`)
      .set(...asAuth(admin.token))
      .send({});
    expect(response.status).toBe(400);
  });
});

function emailSent(to: string) {
  return emailSender.sent.find((message) => message.to === to);
}
