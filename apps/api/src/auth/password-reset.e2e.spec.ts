import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@flight-watch/database';
import type { InMemoryEmailSender } from '@flight-watch/notifications';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_SENDER } from './email-sender.token.js';

/** SPEC-026 — recuperação de senha, Postgres real e sender em memória. */
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let emailSender: InMemoryEmailSender;

const OLD_PASSWORD = 'old-password-1234567';
const NEW_PASSWORD = 'new-password-7654321';

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
  emailSender = app.get(EMAIL_SENDER);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

beforeEach(() => {
  emailSender.sent.length = 0;
});

function http() {
  return request(app.getHttpServer());
}

async function registerUser(): Promise<{ email: string; sessionToken: string }> {
  const email = `${randomUUID()}@example.com`;
  const response = await http()
    .post('/v1/auth/register')
    .send({ email, password: OLD_PASSWORD, timezone: 'America/Campo_Grande' });
  expect(response.status).toBe(201);
  return { email, sessionToken: response.body.token };
}

function resetEmailsTo(email: string) {
  return emailSender.sent.filter(
    (message) => message.to === email && message.textBody.includes('/reset-password?token='),
  );
}

/** O envio não é aguardado pela resposta (SPEC-026): espera ele acontecer. */
async function requestResetToken(email: string): Promise<string> {
  const response = await http().post('/v1/auth/password-reset/request').send({ email });
  expect(response.status).toBe(202);
  const message = await vi.waitFor(() => {
    const found = resetEmailsTo(email).at(-1);
    if (!found) throw new Error('reset e-mail ainda não enviado');
    return found;
  });
  const match = /reset-password\?token=([^\s]+)/.exec(message.textBody);
  if (!match?.[1]) throw new Error('token não encontrado no e-mail');
  return decodeURIComponent(match[1]);
}

function confirm(token: string, password = NEW_PASSWORD) {
  return http().post('/v1/auth/password-reset/confirm').send({ token, password });
}

function login(email: string, password: string) {
  return http().post('/v1/auth/login').send({ email, password });
}

describe('POST /v1/auth/password-reset/request (SPEC-026)', () => {
  // AC-1
  it('responde igual para e-mail existente e inexistente; só o existente recebe e-mail', async () => {
    const { email } = await registerUser();
    emailSender.sent.length = 0;
    const unknown = `${randomUUID()}@example.com`;

    const existing = await http().post('/v1/auth/password-reset/request').send({ email });
    const missing = await http().post('/v1/auth/password-reset/request').send({ email: unknown });

    expect(existing.status).toBe(202);
    expect(missing.status).toBe(202);
    expect(existing.body).toEqual(missing.body);
    await vi.waitFor(() => expect(resetEmailsTo(email)).toHaveLength(1));
    expect(resetEmailsTo(unknown)).toHaveLength(0);
  });

  // AC-9
  it('não envia e-mail para conta que não está ACTIVE', async () => {
    const { email } = await registerUser();
    await prisma.user.update({ where: { email }, data: { status: 'BLOCKED' } });
    emailSender.sent.length = 0;

    const response = await http().post('/v1/auth/password-reset/request').send({ email });
    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(resetEmailsTo(email)).toHaveLength(0);
  });

  it('rejeita e-mail mal formado com INVALID_AUTH_INPUT', async () => {
    const response = await http()
      .post('/v1/auth/password-reset/request')
      .send({ email: 'nao-e-email' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_AUTH_INPUT');
  });
});

describe('POST /v1/auth/password-reset/confirm (SPEC-026)', () => {
  // AC-2
  it('define a nova senha: a antiga para de funcionar e a nova funciona', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    expect((await confirm(token)).status).toBe(204);
    expect((await login(email, OLD_PASSWORD)).status).toBe(401);
    expect((await login(email, NEW_PASSWORD)).status).toBe(200);
  });

  // AC-3
  it('o token só funciona uma vez', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    expect((await confirm(token)).status).toBe(204);
    const second = await confirm(token, 'another-password-000');
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('INVALID_RESET_TOKEN');
  });

  // AC-4
  it('token vencido responde RESET_TOKEN_EXPIRED; desconhecido, INVALID_RESET_TOKEN', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);
    await prisma.user.update({
      where: { email },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await confirm(token);
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe('RESET_TOKEN_EXPIRED');

    const unknown = await confirm('token-que-nunca-existiu');
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_RESET_TOKEN');
  });

  // AC-5
  it('encerra as sessões anteriores', async () => {
    const { email, sessionToken } = await registerUser();
    const me = () => http().get('/v1/auth/me').set('authorization', `Bearer ${sessionToken}`);
    expect((await me()).status).toBe(200);

    expect((await confirm(await requestResetToken(email))).status).toBe(204);
    expect((await me()).status).toBe(401);
  });

  // AC-6
  it('zera o bloqueio por tentativas', async () => {
    const { email } = await registerUser();
    await prisma.user.update({
      where: { email },
      data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });
    expect((await login(email, OLD_PASSWORD)).status).toBe(423);

    expect((await confirm(await requestResetToken(email))).status).toBe(204);
    expect((await login(email, NEW_PASSWORD)).status).toBe(200);
  });

  // AC-7
  it('senha fora da regra responde INVALID_AUTH_INPUT e preserva o token', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    const weak = await confirm(token, 'curta');
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('INVALID_AUTH_INPUT');
    expect((await confirm(token)).status).toBe(204);
  });

  // AC-8
  it('um segundo pedido invalida o token do primeiro', async () => {
    const { email } = await registerUser();
    const first = await requestResetToken(email);
    const second = await requestResetToken(email);
    expect(second).not.toBe(first);

    expect((await confirm(first)).body.code).toBe('INVALID_RESET_TOKEN');
    expect((await confirm(second)).status).toBe(204);
  });

  // AC-9
  it('conta que deixou de estar ACTIVE não consegue confirmar', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);
    await prisma.user.update({ where: { email }, data: { status: 'BLOCKED' } });

    const response = await confirm(token);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_RESET_TOKEN');
  });
});
