import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@flight-watch/database';
import { InMemoryEmailSender, failingSendBehavior } from '@flight-watch/notifications';
import { AppModule } from '../app.module.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_SENDER } from './email-sender.token.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let metrics: MetricsService;
let emailSender: InMemoryEmailSender;

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
  metrics = app.get(MetricsService);
  emailSender = app.get(EMAIL_SENDER);
}, 120_000);

afterEach(() => {
  emailSender.sent.length = 0;
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

function extractToken(textBody: string): string {
  const match = /token=([^&\s]+)/.exec(textBody);
  if (!match?.[1]) {
    throw new Error(`no token found in email body: ${textBody}`);
  }
  return decodeURIComponent(match[1]);
}

function sentEmailAt(index: number): { to: string; textBody: string } {
  const message = emailSender.sent[index];
  if (!message) {
    throw new Error(`no email sent at index ${index}`);
  }
  return message;
}

async function registerUser(): Promise<{ userId: string; email: string; token: string }> {
  const email = `${randomUUID()}@example.com`;
  const response = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ email, password: 'a-very-long-password-123', timezone: 'America/Sao_Paulo' });
  return { userId: response.body.user.id, email, token: response.body.token as string };
}

describe('POST /v1/auth/verify-email and /v1/auth/resend-verification (e2e, Postgres real via Testcontainers)', () => {
  // AC-001
  it('sends a verification email on register, and notificationChannelVerified is false', async () => {
    const { email, token } = await registerUser();

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe(email);
    expect(emailSender.sent[0]?.textBody).toContain('/verify-email?token=');

    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${token}`);
    expect(me.body.notificationChannelVerified).toBe(false);
  });

  // AC-002
  it('verifies the channel with a valid token, unblocking watch creation', async () => {
    const { token } = await registerUser();
    const verificationToken = extractToken(sentEmailAt(0).textBody);

    const response = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'verified' });

    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${token}`);
    expect(me.body.notificationChannelVerified).toBe(true);
  });

  // AC-003
  it('is idempotent when the same token is verified twice', async () => {
    await registerUser();
    const verificationToken = extractToken(sentEmailAt(0).textBody);

    const first = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });
    const second = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  // AC-004
  it('returns 400 INVALID_VERIFICATION_TOKEN for a token that does not exist', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: 'not-a-real-token' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_VERIFICATION_TOKEN');
  });

  // AC-005
  it('returns 400 VERIFICATION_TOKEN_EXPIRED for an expired, not-yet-verified token', async () => {
    const { token } = await registerUser();
    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${token}`);
    await prisma.notificationChannel.update({
      where: { id: me.body.notificationChannelId },
      data: { verificationTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    const verificationToken = extractToken(sentEmailAt(0).textBody);

    const response = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VERIFICATION_TOKEN_EXPIRED');
  });

  // AC-006
  it('returns 401 when resending without a session', async () => {
    const response = await request(app.getHttpServer()).post('/v1/auth/resend-verification');
    expect(response.status).toBe(401);
  });

  // AC-007
  it('resend issues a new token that works, and the previous token stops working', async () => {
    const { token } = await registerUser();
    const firstToken = extractToken(sentEmailAt(0).textBody);

    const resend = await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .set('authorization', `Bearer ${token}`);
    expect(resend.status).toBe(204);
    expect(emailSender.sent).toHaveLength(2);
    const secondToken = extractToken(sentEmailAt(1).textBody);
    expect(secondToken).not.toBe(firstToken);

    const oldTokenAttempt = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: firstToken });
    expect(oldTokenAttempt.status).toBe(400);
    expect(oldTokenAttempt.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    const newTokenAttempt = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: secondToken });
    expect(newTokenAttempt.status).toBe(200);
  });

  // AC-008
  it('resend on an already-verified channel is a no-op, without sending a new email', async () => {
    const { token } = await registerUser();
    const verificationToken = extractToken(sentEmailAt(0).textBody);
    await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });

    const resend = await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .set('authorization', `Bearer ${token}`);

    expect(resend.status).toBe(204);
    expect(emailSender.sent).toHaveLength(1);
  });

  // AC-009: falha do EmailSender não impede o registro (best-effort).
  it('still creates the account when the email provider fails', async () => {
    const failingSender = new InMemoryEmailSender(
      failingSendBehavior('TIMEOUT', 'simulated provider outage'),
    );
    const failingModuleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(failingSender)
      .compile();
    const failingApp = failingModuleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await failingApp.init();
    await failingApp.getHttpAdapter().getInstance().ready();

    try {
      const response = await request(failingApp.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: `${randomUUID()}@example.com`,
          password: 'a-very-long-password-123',
          timezone: 'America/Sao_Paulo',
        });

      expect(response.status).toBe(201);
      expect(response.body.token).toBeTruthy();
    } finally {
      await failingApp.close();
    }
  });

  it('records auth_verify_email_total and auth_resend_verification_total with the labels documented in SPEC-010 §14', async () => {
    const { token } = await registerUser();
    const verificationToken = extractToken(sentEmailAt(0).textBody);

    await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });
    await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verificationToken });
    await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: 'not-a-real-token' });
    await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .set('authorization', `Bearer ${token}`);

    const body = await metrics.registry.metrics();
    expect(body).toContain('auth_verify_email_total{result="success"}');
    expect(body).toContain('auth_verify_email_total{result="already_verified"}');
    expect(body).toContain('auth_verify_email_total{result="invalid_verification_token"}');
    expect(body).toContain('auth_resend_verification_total{result="already_verified"}');
  });
});
