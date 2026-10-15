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
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CAPTCHA_VERIFIER, type CaptchaVerdict, type CaptchaVerifier } from './captcha.js';

/** Verificador falso: o token diz o veredito ("ok", "bad", "down"). */
class FakeVerifier implements CaptchaVerifier {
  readonly enabled = true;
  verify(token: string): Promise<CaptchaVerdict> {
    const verdicts: Record<string, CaptchaVerdict> = {
      ok: 'passed',
      bad: 'failed',
      down: 'unavailable',
    };
    return Promise.resolve(verdicts[token] ?? 'failed');
  }
}

const PASSWORD = 'a-very-long-password-123';
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CAPTCHA_VERIFIER)
    .useValue(new FakeVerifier())
    .compile();
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

function register(email: string, captchaToken?: string) {
  return request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({
      email,
      password: PASSWORD,
      timezone: 'America/Sao_Paulo',
      ...(captchaToken ? { captchaToken } : {}),
    });
}

describe('captcha nas rotas de conta (SPEC-041)', () => {
  it('cadastro: sem token, token recusado e aprovado', async () => {
    const email = `${randomUUID()}@example.com`;

    const missing = await register(email);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('CAPTCHA_REQUIRED');

    const refused = await register(email, 'bad');
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('CAPTCHA_FAILED');
    // AC-1: nada chegou ao banco.
    expect(await prisma.user.count({ where: { email } })).toBe(0);

    const passed = await register(email, 'ok');
    expect(passed.status).toBe(201);
  });

  it('Cloudflare fora deixa passar e registra indisponível (AC-3)', async () => {
    const response = await register(`${randomUUID()}@example.com`, 'down');
    expect(response.status).toBe(201);
    const metrics = await app.get(MetricsService).registry.metrics();
    expect(metrics).toContain('auth_captcha_total{result="unavailable"} 1');
  });

  it('login e pedido de nova senha também exigem o token', async () => {
    const email = `${randomUUID()}@example.com`;
    await register(email, 'ok');

    const loginMissing = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(loginMissing.body.code).toBe('CAPTCHA_REQUIRED');
    const loginOk = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD, captchaToken: 'ok' });
    expect(loginOk.status).toBe(200);

    const resetMissing = await request(app.getHttpServer())
      .post('/v1/auth/password-reset/request')
      .send({ email });
    expect(resetMissing.body.code).toBe('CAPTCHA_REQUIRED');
    const resetOk = await request(app.getHttpServer())
      .post('/v1/auth/password-reset/request')
      .send({ email, captchaToken: 'ok' });
    expect(resetOk.status).toBe(202);
  });
});
