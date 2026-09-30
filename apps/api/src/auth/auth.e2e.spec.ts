import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@flight-watch/database';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashOpaqueToken } from './opaque-token.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  const databasePackageDir = path.resolve(process.cwd(), '../../packages/database');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: databasePackageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  registerCorrelationHook(app);
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService).client;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `${randomUUID()}@example.com`,
    password: 'a-very-long-password-123',
    timezone: 'America/Campo_Grande',
    ...overrides,
  };
}

describe('POST /v1/auth/register (e2e, Postgres real via Testcontainers)', () => {
  // AC-001
  it('creates an active user with an unverified notification channel and a session', async () => {
    const body = registerBody();

    const response = await request(app.getHttpServer()).post('/v1/auth/register').send(body);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(body.email);
    expect(response.body.user.status).toBe('ACTIVE');
    expect(response.body.user.notificationChannelId).toEqual(expect.any(String));
    expect(response.body.token).toEqual(expect.any(String));

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: response.body.user.id } });
    expect(stored.passwordHash).not.toBe(body.password);
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);

    const channel = await prisma.notificationChannel.findUniqueOrThrow({
      where: { id: response.body.user.notificationChannelId },
    });
    expect(channel.verifiedAt).toBeNull();

    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashOpaqueToken(response.body.token) },
    });
    expect(session.userId).toBe(response.body.user.id);
  });

  // AC-002
  it('returns 409 EMAIL_ALREADY_REGISTERED for a duplicate email', async () => {
    const body = registerBody();
    const first = await request(app.getHttpServer()).post('/v1/auth/register').send(body);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ ...body, password: 'a-different-password-456' });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EMAIL_ALREADY_REGISTERED');

    const count = await prisma.user.count({ where: { email: body.email } });
    expect(count).toBe(1);
  });

  it('returns 400 INVALID_AUTH_INPUT for a malformed email', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(registerBody({ email: 'not-an-email' }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_AUTH_INPUT');
  });

  it('returns 400 INVALID_AUTH_INPUT for a password below the minimum length', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(registerBody({ password: 'short' }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_AUTH_INPUT');
  });

  // SPEC-001 dependency check: a freshly registered user legitimately hits
  // CHANNEL_NOT_VERIFIED (SPEC-001 §8) when creating a watch — no email
  // verification flow exists yet (SPEC-007 §2).
  it('leaves the new channel unverified, so creating a watch fails with CHANNEL_NOT_VERIFIED', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(registerBody());

    const watchResponse = await request(app.getHttpServer())
      .post('/v1/watches')
      .set('authorization', `Bearer ${registerResponse.body.token}`)
      .send({
        origin: 'GRU',
        destination: 'JFK',
        tripType: 'ONE_WAY',
        departureDate: '2027-12-15',
        returnDate: null,
        cabin: 'ECONOMY',
        adults: 1,
        currency: 'BRL',
        market: 'BR',
        alertRules: [{ type: 'TARGET_PRICE', amountMinor: 250_000, cooldownSeconds: 3600 }],
        notificationChannelId: registerResponse.body.user.notificationChannelId,
      });

    expect(watchResponse.status).toBe(403);
    expect(watchResponse.body.code).toBe('CHANNEL_NOT_VERIFIED');
  });
});

describe('POST /v1/auth/login (e2e, Postgres real via Testcontainers)', () => {
  it('returns a new session for correct credentials', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/v1/auth/register').send(body);

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: body.email, password: body.password });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(body.email);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it('returns 401 INVALID_CREDENTIALS for the wrong password', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/v1/auth/register').send(body);

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: body.email, password: 'totally-wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  // SPEC-007 §8: não expõe se o email existe — mesmo código de "senha errada".
  it('returns the same 401 INVALID_CREDENTIALS for an email that does not exist', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: `${randomUUID()}@example.com`, password: 'whatever-password-123' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  // AC-005
  it('locks the account after 5 consecutive failed attempts', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/v1/auth/register').send(body);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: body.email, password: 'wrong-password-attempt' });
      expect(failed.status).toBe(401);
    }

    const lockedResponse = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: body.email, password: body.password });

    expect(lockedResponse.status).toBe(423);
    expect(lockedResponse.body.code).toBe('ACCOUNT_LOCKED');
  });

  // Regressão: o contador de tentativas malsucedidas usava um read-then-write
  // não atômico (ler failedLoginAttempts, somar em memória, escrever de
  // volta) — sob 5 tentativas erradas disparadas em paralelo (não em série),
  // corridas concorrentes liam o mesmo valor e perdiam incrementos, e a conta
  // nunca chegava a bloquear. O fix usa `increment` atômico no banco.
  it('locks the account after 5 concurrent failed attempts, not just sequential ones', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/v1/auth/register').send(body);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: body.email, password: 'wrong-password-attempt' }),
      ),
    );
    for (const attempt of attempts) {
      expect(attempt.status).toBe(401);
    }

    const lockedResponse = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: body.email, password: body.password });

    expect(lockedResponse.status).toBe(423);
    expect(lockedResponse.body.code).toBe('ACCOUNT_LOCKED');
  });

  // Credenciais corretas não bastam se a conta não estiver ACTIVE — sem esta
  // checagem, uma conta BLOCKED/DELETED continuava conseguindo logar (e
  // emitir sessões novas) só por saber a senha certa.
  it('returns 403 ACCOUNT_NOT_ACTIVE for correct credentials on a non-ACTIVE account', async () => {
    const body = registerBody();
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(body);

    await prisma.user.update({
      where: { id: registerResponse.body.user.id },
      data: { status: 'BLOCKED' },
    });

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: body.email, password: body.password });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });
});

describe('POST /v1/auth/logout and GET /v1/auth/me (e2e, Postgres real via Testcontainers)', () => {
  it('returns the current user for a valid session', async () => {
    const body = registerBody();
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(body);

    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${registerResponse.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(registerResponse.body.user.id);
    expect(response.body.email).toBe(body.email);
  });

  it('returns 401 for a missing or garbage token', async () => {
    const missing = await request(app.getHttpServer()).get('/v1/auth/me');
    expect(missing.status).toBe(401);

    const garbage = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', 'Bearer not-a-real-token');
    expect(garbage.status).toBe(401);
  });

  it('returns 401 for an expired session', async () => {
    const body = registerBody();
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(body);

    await prisma.session.updateMany({
      where: { userId: registerResponse.body.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${registerResponse.body.token}`);

    expect(response.status).toBe(401);
  });

  // Uma sessão emitida ANTES de a conta ser bloqueada/excluída não deve
  // continuar autorizando nada — sem esta checagem, o token seguia válido até
  // expirar naturalmente (até 30 dias) mesmo pra uma conta já bloqueada.
  it('returns 401 once the session’s user is no longer ACTIVE, even with a valid unexpired token', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(registerBody());
    const token = registerResponse.body.token as string;

    const before = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    await prisma.user.update({
      where: { id: registerResponse.body.user.id },
      data: { status: 'BLOCKED' },
    });

    const after = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  // AC-006
  it('invalidates the session on the server, not just the client', async () => {
    const body = registerBody();
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(body);
    const token = registerResponse.body.token as string;

    const logoutResponse = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('authorization', `Bearer ${token}`);
    expect(logoutResponse.status).toBe(204);

    const meResponse = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${token}`);
    expect(meResponse.status).toBe(401);

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    expect(session).toBeNull();
  });

  // SPEC-007 §9: a operação de logout em si (deletar uma sessão) é idempotente
  // — repetir não é erro interno. O endpoint exige sessão válida via o mesmo
  // guard de qualquer outra rota autenticada, então um token já invalidado
  // corretamente vira 401 na segunda chamada, não um 500: a idempotência está
  // em "chamar de novo nunca quebra o sistema", não em "sempre devolve 204".
  it('does not error when logout is called again with an already-invalidated token', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(registerBody());
    const token = registerResponse.body.token as string;

    const first = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('authorization', `Bearer ${token}`);
    expect(first.status).toBe(204);

    const second = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('authorization', `Bearer ${token}`);
    expect(second.status).toBe(401);
  });

  // G6: sessão de um usuário nunca autoriza acesso a dados de outro.
  it('never returns another user’s identity for a different user’s token', async () => {
    const userA = await request(app.getHttpServer()).post('/v1/auth/register').send(registerBody());
    const userB = await request(app.getHttpServer()).post('/v1/auth/register').send(registerBody());

    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${userA.body.token}`);

    expect(response.body.id).toBe(userA.body.user.id);
    expect(response.body.id).not.toBe(userB.body.user.id);
  });
});
