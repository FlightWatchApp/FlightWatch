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
import { resetAffiliateConfigCache } from '../affiliate/affiliate-links.js';
import { registerCorrelationHook } from '../observability/correlation.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
let metrics: MetricsService;

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
  // SPEC-029: rotas são validadas no catálogo de lugares.
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
  metrics = app.get(MetricsService);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

/**
 * Registra um usuário real via POST /v1/auth/register (SPEC-007) e verifica
 * manualmente o canal criado — o registro em si deixa o canal não verificado
 * de propósito (ver auth.e2e.spec.ts), mas os testes de SPEC-001 aqui
 * precisam de um canal verificado pra exercitar o caminho feliz de criação.
 */
async function createVerifiedUserWithChannel(): Promise<{
  userId: string;
  channelId: string;
  token: string;
}> {
  const registerResponse = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({
      email: `${randomUUID()}@example.com`,
      password: 'a-very-long-password-123',
      timezone: 'America/Sao_Paulo',
    });
  const channel = await prisma.notificationChannel.update({
    where: { id: registerResponse.body.user.notificationChannelId },
    data: { verifiedAt: new Date() },
  });
  return {
    userId: registerResponse.body.user.id,
    channelId: channel.id,
    token: registerResponse.body.token as string,
  };
}

function authHeader(token: string): [string, string] {
  return ['authorization', `Bearer ${token}`];
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    origin: 'DOU',
    destination: 'GRU',
    tripType: 'ONE_WAY',
    departureDate: '2026-12-20',
    returnDate: null,
    cabin: 'ECONOMY',
    adults: 1,
    currency: 'BRL',
    market: 'BR',
    alertRules: [{ type: 'TARGET_PRICE', amountMinor: 80000, cooldownSeconds: 43200 }],
    notificationChannelId: '',
    ...overrides,
  };
}

describe('POST /v1/watches (e2e, Postgres real via Testcontainers)', () => {
  // AC-001
  it('creates an active Watch with its alert rules', async () => {
    const { userId, channelId, token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(validBody({ notificationChannelId: channelId }));

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.search.origin).toBe('DOU');
    expect(response.body.alertRules).toHaveLength(1);

    const stored = await prisma.watch.findUnique({ where: { id: response.body.id } });
    expect(stored?.userId).toBe(userId);
  });

  // DOMAIN.md §3.2: expiresAt precisa ser setado na criação (regressão: ficava
  // sempre null, e o Watch nunca saía de ACTIVE mesmo muito depois da viagem —
  // ver apps/scheduler/src/tick.test.ts pra reconciliação de expirados).
  it('sets expiresAt to the day after departureDate on creation', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(
        validBody({
          notificationChannelId: channelId,
          departureDate: '2027-09-10',
          returnDate: null,
        }),
      );

    expect(response.status).toBe(201);
    const stored = await prisma.watch.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.expiresAt?.toISOString()).toBe('2027-09-11T00:00:00.000Z');
  });

  // AC-002 / EVAL-DEDUP-001 no nível HTTP: 10 usuários diferentes, mesma rota,
  // requisições concorrentes reais -> 10 Watches, 1 SearchTarget só.
  it('deduplicates 10 concurrent watches for different users onto one SearchTarget', async () => {
    const users = await Promise.all(
      Array.from({ length: 10 }, () => createVerifiedUserWithChannel()),
    );

    const responses = await Promise.all(
      users.map(({ channelId, token }) =>
        request(app.getHttpServer())
          .post('/v1/watches')
          .set(...authHeader(token))
          .send(validBody({ notificationChannelId: channelId, departureDate: '2027-03-10' })),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const watchIds = new Set(responses.map((r) => r.body.id));
    expect(watchIds.size).toBe(10);

    const targetCount = await prisma.searchTarget.count({
      where: { departureDate: new Date('2027-03-10') },
    });
    expect(targetCount).toBe(1);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .send(validBody({ notificationChannelId: randomUUID() }));
    expect(response.status).toBe(401);
  });

  it('returns 400 INVALID_WATCH_INPUT for an inconsistent payload', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(validBody({ notificationChannelId: channelId, destination: 'DOU' }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_WATCH_INPUT');
  });

  // SPEC-001 §8: não expõe se o canal existe ou pertence a outro usuário.
  it('returns 403 CHANNEL_NOT_VERIFIED for a channel owned by another user', async () => {
    const owner = await createVerifiedUserWithChannel();
    const requester = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(requester.token))
      .send(validBody({ notificationChannelId: owner.channelId, departureDate: '2027-04-01' }));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CHANNEL_NOT_VERIFIED');
  });

  it('returns 422 UNSUPPORTED_SEARCH for a route outside the placeholder catalog', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(
        validBody({
          notificationChannelId: channelId,
          origin: 'BSB',
          destination: 'CGH',
          currency: 'EUR',
        }),
      );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('UNSUPPORTED_SEARCH');
  });

  // AC-005: repetição da mesma Idempotency-Key + mesmo payload retorna o mesmo Watch.
  it('replays the same Watch for a repeated Idempotency-Key with the same payload', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const body = validBody({ notificationChannelId: channelId, departureDate: '2027-05-15' });
    const idempotencyKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .set('idempotency-key', idempotencyKey)
      .send(body);
    const second = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .set('idempotency-key', idempotencyKey)
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.watch.count({ where: { id: first.body.id } });
    expect(count).toBe(1);
  });

  it('returns 409 IDEMPOTENCY_CONFLICT when the same key is reused with a different payload', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const idempotencyKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .set('idempotency-key', idempotencyKey)
      .send(validBody({ notificationChannelId: channelId, departureDate: '2027-06-01' }));
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .set('idempotency-key', idempotencyKey)
      .send(validBody({ notificationChannelId: channelId, departureDate: '2027-06-02' }));

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('GET /v1/watches (e2e, Postgres real via Testcontainers)', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app.getHttpServer()).get('/v1/watches');
    expect(response.status).toBe(401);
  });

  it('lists only the requesting user’s watches, most recent first', async () => {
    const owner = await createVerifiedUserWithChannel();
    const other = await createVerifiedUserWithChannel();

    await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(other.token))
      .send(validBody({ notificationChannelId: other.channelId, departureDate: '2027-07-01' }));

    const created = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(owner.token))
      .send(validBody({ notificationChannelId: owner.channelId, departureDate: '2027-07-02' }));

    const response = await request(app.getHttpServer())
      .get('/v1/watches')
      .set(...authHeader(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.watches).toHaveLength(1);
    expect(response.body.watches[0].id).toBe(created.body.id);
    expect(response.body.watches[0].status).toBe('ACTIVE');
    expect(response.body.watches[0].currentPrice).toBeNull();
    expect(response.body.watches[0].lastCheck).toBeNull();
  });

  it('reflects the latest and lowest observed prices once a check has run', async () => {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const created = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(validBody({ notificationChannelId: channelId, departureDate: '2027-08-01' }));

    const watch = await prisma.watch.findUniqueOrThrow({ where: { id: created.body.id } });
    const execution = await prisma.searchExecution.create({
      data: {
        searchTargetId: watch.searchTargetId,
        providerStrategy: 'SIMULATED',
        status: 'SUCCEEDED',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        completedAt: new Date(),
      },
    });
    await prisma.priceObservation.createMany({
      data: [
        {
          searchTargetId: watch.searchTargetId,
          searchExecutionId: execution.id,
          providerStrategy: 'SIMULATED',
          observedAt: new Date(Date.now() - 60_000),
          totalAmountMinor: 120_000,
          currency: 'BRL',
          itinerary: [],
          offerSignature: randomUUID(),
          qualityFlags: [],
          observationKey: randomUUID(),
          selectionPolicyVersion: 1,
          normalizerVersion: 1,
        },
      ],
    });
    // Uma segunda execução/observação exige sua própria execução (1:1 com PriceObservation).
    const secondExecution = await prisma.searchExecution.create({
      data: {
        searchTargetId: watch.searchTargetId,
        providerStrategy: 'SIMULATED',
        status: 'SUCCEEDED',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        completedAt: new Date(),
      },
    });
    await prisma.priceObservation.create({
      data: {
        searchTargetId: watch.searchTargetId,
        searchExecutionId: secondExecution.id,
        providerStrategy: 'SIMULATED',
        observedAt: new Date(),
        totalAmountMinor: 95_000,
        currency: 'BRL',
        itinerary: [],
        offerSignature: randomUUID(),
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/v1/watches')
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    const item = response.body.watches.find((w: { id: string }) => w.id === created.body.id);
    expect(item.currentPrice).toEqual({ amountMinor: 95_000, currency: 'BRL' });
    expect(item.lowestPrice).toEqual({ amountMinor: 95_000, currency: 'BRL' });
    expect(item.lastCheck.outcome).toBe('succeeded');
  });
});

describe('POST /v1/watches/:id/{pause,reactivate,cancel} (e2e, Postgres real via Testcontainers)', () => {
  async function createWatch(overrides: Record<string, unknown> = {}) {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(validBody({ notificationChannelId: channelId, ...overrides }));
    return { watchId: response.body.id as string, token };
  }

  // AC-001
  it('pauses an ACTIVE watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-01' });

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PAUSED');
    const stored = await prisma.watch.findUniqueOrThrow({ where: { id: watchId } });
    expect(stored.status).toBe('PAUSED');
    expect(stored.version).toBe(1);
  });

  // AC-002
  it('reactivates a PAUSED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-02' });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/reactivate`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ACTIVE');
  });

  // AC-003
  it('cancels an ACTIVE watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-03' });

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/cancel`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
  });

  it('cancels a PAUSED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-04' });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/cancel`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
  });

  // AC-004: repetir a mesma ação já no destino é sucesso idempotente, sem
  // incrementar version de novo.
  it('is idempotent when pausing an already PAUSED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-05' });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PAUSED');
    const stored = await prisma.watch.findUniqueOrThrow({ where: { id: watchId } });
    expect(stored.version).toBe(1);
  });

  it('is idempotent when cancelling an already CANCELLED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-06' });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/cancel`)
      .set(...authHeader(token));

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/cancel`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
  });

  // AC-005
  it('returns 409 INVALID_WATCH_TRANSITION when reactivating a CANCELLED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-07' });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/cancel`)
      .set(...authHeader(token));

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/reactivate`)
      .set(...authHeader(token));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVALID_WATCH_TRANSITION');
  });

  it('returns 409 INVALID_WATCH_TRANSITION for any action on an EXPIRED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-08' });
    await prisma.watch.update({ where: { id: watchId }, data: { status: 'EXPIRED' } });

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/reactivate`)
      .set(...authHeader(token));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVALID_WATCH_TRANSITION');
  });

  // AC-006: Watch de outro usuário -> 404, nunca 403 (não confirma existência).
  it('returns 404 WATCH_NOT_FOUND for a watch owned by another user', async () => {
    const { watchId } = await createWatch({ departureDate: '2027-10-09' });
    const other = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(other.token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('WATCH_NOT_FOUND');
  });

  it('returns 404 WATCH_NOT_FOUND for a nonexistent watch id', async () => {
    const { token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${randomUUID()}/pause`)
      .set(...authHeader(token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('WATCH_NOT_FOUND');
  });

  // AC-007
  it('returns 400 INVALID_WATCH_ID for a malformed id', async () => {
    const { token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post('/v1/watches/not-a-uuid/pause')
      .set(...authHeader(token));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_WATCH_ID');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app.getHttpServer()).post(`/v1/watches/${randomUUID()}/pause`);
    expect(response.status).toBe(401);
  });

  // SPEC-008 §9: a escrita condicional (`status IN (...)`) garante que, sob
  // corrida real, uma das duas chamadas concorrentes da mesma ação vence e a
  // outra recebe o resultado idempotente — nunca as duas aplicando a mesma
  // transição nem um estado intermediário.
  it('applies the same concurrent action exactly once, without error on either call', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-10' });

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/v1/watches/${watchId}/pause`)
        .set(...authHeader(token)),
      request(app.getHttpServer())
        .post(`/v1/watches/${watchId}/pause`)
        .set(...authHeader(token)),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.status).toBe('PAUSED');
    expect(second.body.status).toBe('PAUSED');
    const stored = await prisma.watch.findUniqueOrThrow({ where: { id: watchId } });
    expect(stored.version).toBe(1);
  });

  // AC-005: cobertura de review — a suíte só testava EXPIRED, não COMPLETED
  // nem `pause` sobre CANCELLED.
  it.each(['pause', 'reactivate', 'cancel'] as const)(
    'returns 409 INVALID_WATCH_TRANSITION for %s on a COMPLETED watch',
    async (action) => {
      const { watchId, token } = await createWatch({ departureDate: '2027-10-11' });
      await prisma.watch.update({ where: { id: watchId }, data: { status: 'COMPLETED' } });

      const response = await request(app.getHttpServer())
        .post(`/v1/watches/${watchId}/${action}`)
        .set(...authHeader(token));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INVALID_WATCH_TRANSITION');
    },
  );

  it('returns 409 INVALID_WATCH_TRANSITION when pausing a CANCELLED watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-12' });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/cancel`)
      .set(...authHeader(token));

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVALID_WATCH_TRANSITION');
  });

  // SPEC-008 §13: achado de review — os labels de `result` precisam bater
  // exatamente com o que a spec documenta (success/idempotent_noop/not_found/
  // invalid_transition), não com o errorCode cru.
  it('records watch_lifecycle_transition_total with the exact labels documented in SPEC-008 §13', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-10-13' });

    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));
    await request(app.getHttpServer())
      .post(`/v1/watches/${randomUUID()}/pause`)
      .set(...authHeader(token));
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/reactivate`)
      .set(...authHeader(token));
    await prisma.watch.update({ where: { id: watchId }, data: { status: 'COMPLETED' } });
    await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    const body = await metrics.registry.metrics();
    expect(body).toContain('watch_lifecycle_transition_total{action="pause",result="success"}');
    expect(body).toContain(
      'watch_lifecycle_transition_total{action="pause",result="idempotent_noop"}',
    );
    expect(body).toContain('watch_lifecycle_transition_total{action="pause",result="not_found"}');
    expect(body).toContain(
      'watch_lifecycle_transition_total{action="pause",result="invalid_transition"}',
    );
    expect(body).not.toContain('result="watch_not_found"');
    expect(body).not.toContain('result="invalid_watch_transition"');
  });
});

describe('GET /v1/watches/:id (e2e, Postgres real via Testcontainers)', () => {
  async function createWatch(overrides: Record<string, unknown> = {}) {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(validBody({ notificationChannelId: channelId, ...overrides }));
    return { watchId: response.body.id as string, token };
  }

  // AC-001
  it('returns an empty priceHistory and null prices for a watch with no observation yet', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-11-01' });

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.priceHistory).toEqual([]);
    expect(response.body.currentPrice).toBeNull();
    expect(response.body.lowestPrice).toBeNull();
  });

  // AC-002
  it('returns priceHistory ordered by observedAt ascending', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-11-02' });
    const watch = await prisma.watch.findUniqueOrThrow({ where: { id: watchId } });

    async function seedObservation(amountMinor: number, observedAt: Date) {
      const execution = await prisma.searchExecution.create({
        data: {
          searchTargetId: watch.searchTargetId,
          providerStrategy: 'SIMULATED',
          status: 'SUCCEEDED',
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
          completedAt: observedAt,
        },
      });
      await prisma.priceObservation.create({
        data: {
          searchTargetId: watch.searchTargetId,
          searchExecutionId: execution.id,
          providerStrategy: 'SIMULATED',
          observedAt,
          totalAmountMinor: amountMinor,
          currency: 'BRL',
          itinerary: [],
          offerSignature: randomUUID(),
          qualityFlags: [],
          observationKey: randomUUID(),
          selectionPolicyVersion: 1,
          normalizerVersion: 1,
        },
      });
    }

    // observedAt precisa ser >= watch.startsAt (SPEC-009 §6) — startsAt é
    // "agora" no momento da criação do Watch, então os pontos avançam a
    // partir dali em vez de usar deslocamentos negativos a partir de "agora".
    await seedObservation(100_000, new Date(watch.startsAt.getTime() + 1_000));
    await seedObservation(90_000, new Date(watch.startsAt.getTime() + 2_000));
    await seedObservation(95_000, new Date(watch.startsAt.getTime() + 3_000));

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.priceHistory).toHaveLength(3);
    expect(response.body.priceHistory.map((p: { amountMinor: number }) => p.amountMinor)).toEqual([
      100_000, 90_000, 95_000,
    ]);
    expect(response.body.lowestPrice).toEqual({ amountMinor: 90_000, currency: 'BRL' });
    expect(response.body.currentPrice).toEqual({ amountMinor: 95_000, currency: 'BRL' });
  });

  // AC-003: observação de antes do Watch existir (SearchTarget compartilhado
  // com um Watch mais antigo) não entra no histórico deste Watch.
  it('excludes observations recorded before the watch started', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-11-03' });
    const watch = await prisma.watch.findUniqueOrThrow({ where: { id: watchId } });

    const execution = await prisma.searchExecution.create({
      data: {
        searchTargetId: watch.searchTargetId,
        providerStrategy: 'SIMULATED',
        status: 'SUCCEEDED',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      },
    });
    await prisma.priceObservation.create({
      data: {
        searchTargetId: watch.searchTargetId,
        searchExecutionId: execution.id,
        providerStrategy: 'SIMULATED',
        observedAt: new Date(watch.startsAt.getTime() - 3_600_000),
        totalAmountMinor: 50_000,
        currency: 'BRL',
        itinerary: [],
        offerSignature: randomUUID(),
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.priceHistory).toEqual([]);
  });

  // AC-004
  it('returns 404 WATCH_NOT_FOUND for a watch owned by another user', async () => {
    const { watchId } = await createWatch({ departureDate: '2027-11-04' });
    const other = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(other.token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('WATCH_NOT_FOUND');
  });

  // AC-005
  it('returns 400 INVALID_WATCH_ID for a malformed id', async () => {
    const { token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .get('/v1/watches/not-a-uuid')
      .set(...authHeader(token));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_WATCH_ID');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app.getHttpServer()).get(`/v1/watches/${randomUUID()}`);
    expect(response.status).toBe(401);
  });

  // AC-006: os campos compartilhados com a listagem são byte-a-byte iguais.
  it('matches the same fields returned by GET /v1/watches for the same watch', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-11-05' });

    const [detail, list] = await Promise.all([
      request(app.getHttpServer())
        .get(`/v1/watches/${watchId}`)
        .set(...authHeader(token)),
      request(app.getHttpServer())
        .get('/v1/watches')
        .set(...authHeader(token)),
    ]);

    const listItem = list.body.watches.find((w: { id: string }) => w.id === watchId);
    const detailWithoutHistory = { ...detail.body };
    delete detailWithoutHistory.priceHistory;
    expect(detailWithoutHistory).toEqual(listItem);
  });

  // SPEC-009 §13: achado de review — nenhum teste lia o registry pra confirmar
  // os labels de watch_detail_fetch_total.
  it('records watch_detail_fetch_total with success and not_found labels', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-11-06' });

    await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));
    await request(app.getHttpServer())
      .get(`/v1/watches/${randomUUID()}`)
      .set(...authHeader(token));

    const body = await metrics.registry.metrics();
    expect(body).toContain('watch_detail_fetch_total{result="success"}');
    expect(body).toContain('watch_detail_fetch_total{result="not_found"}');
  });
});

describe('currentOffer projection and POST /v1/watches/:id/purchase-click (SPEC-018, e2e, Postgres real via Testcontainers)', () => {
  async function createWatch(overrides: Record<string, unknown> = {}) {
    const { channelId, token } = await createVerifiedUserWithChannel();
    const response = await request(app.getHttpServer())
      .post('/v1/watches')
      .set(...authHeader(token))
      .send(validBody({ notificationChannelId: channelId, ...overrides }));
    return { watchId: response.body.id as string, token };
  }

  async function seedObservation(
    watchId: string,
    overrides: {
      deeplink?: string | null;
      expiresAt?: Date | null;
      totalAmountMinor?: number;
      observedAt?: Date;
    } = {},
  ) {
    const watch = await prisma.watch.findUniqueOrThrow({ where: { id: watchId } });
    const execution = await prisma.searchExecution.create({
      data: {
        searchTargetId: watch.searchTargetId,
        providerStrategy: 'SIMULATED',
        status: 'SUCCEEDED',
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        completedAt: new Date(),
      },
    });
    await prisma.priceObservation.create({
      data: {
        searchTargetId: watch.searchTargetId,
        searchExecutionId: execution.id,
        providerStrategy: 'SIMULATED',
        observedAt: overrides.observedAt ?? new Date(),
        totalAmountMinor: overrides.totalAmountMinor ?? 90_000,
        currency: 'BRL',
        itinerary: [],
        offerSignature: randomUUID(),
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
        deeplink:
          overrides.deeplink === undefined
            ? `https://booking.simulated-provider.flightwatch.dev/checkout/${randomUUID()}`
            : overrides.deeplink,
        expiresAt:
          overrides.expiresAt === undefined
            ? new Date(Date.now() + 3_600_000)
            : overrides.expiresAt,
      },
    });
  }

  // AC-001/AC-004: currentOffer vem do mesmo snapshot que currentPrice.
  it('includes currentOffer in GET /v1/watches when there is a valid deep link', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-01' });
    await seedObservation(watchId, { totalAmountMinor: 77_000 });

    const response = await request(app.getHttpServer())
      .get('/v1/watches')
      .set(...authHeader(token));

    const item = response.body.watches.find((w: { id: string }) => w.id === watchId);
    expect(item.currentOffer).toMatchObject({
      amountMinor: 77_000,
      currency: 'BRL',
      provider: 'SIMULATED',
      status: 'CURRENT',
    });
    expect(item.currentOffer.purchaseUrl).toMatch(
      /^https:\/\/booking\.simulated-provider\.flightwatch\.dev\/checkout\//,
    );
  });

  // AC-002
  it('includes currentOffer in GET /v1/watches/:id', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-02' });
    await seedObservation(watchId);

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.body.currentOffer).not.toBeNull();
    expect(response.body.currentOffer.purchaseUrl).toContain('booking.simulated-provider');
  });

  // AC-003
  it('includes currentOffer in the lifecycle transition response', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-03' });
    await seedObservation(watchId);

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/pause`)
      .set(...authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.currentOffer).not.toBeNull();
  });

  // AC-005
  it('returns currentOffer: null for a watch with no observation', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-04' });

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.body.currentOffer).toBeNull();
  });

  // AC-006: host fora da allowlist nunca chega à resposta HTTP.
  it('returns currentOffer: null and increments purchase_link_missing_total for a disallowed host', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-05' });
    await seedObservation(watchId, { deeplink: 'https://evil.example.com/checkout' });

    const response = await request(app.getHttpServer())
      .get('/v1/watches')
      .set(...authHeader(token));

    const item = response.body.watches.find((w: { id: string }) => w.id === watchId);
    expect(item.currentOffer).toBeNull();

    const body = await metrics.registry.metrics();
    expect(body).toContain('purchase_link_missing_total{provider="SIMULATED"}');
  });

  // SPEC-020: mesmo mecanismo de afiliado da superfície WATCH.
  it('adds affiliate params and utm_campaign=watch when AFFILIATE_TRACKING_PARAMS is set', async () => {
    const previous = process.env.AFFILIATE_TRACKING_PARAMS;
    process.env.AFFILIATE_TRACKING_PARAMS = '{"SIMULATED":{"marker":"fw-e2e"}}';
    resetAffiliateConfigCache();
    try {
      const { watchId, token } = await createWatch({ departureDate: '2027-12-07' });
      await seedObservation(watchId, { totalAmountMinor: 77_000 });

      const response = await request(app.getHttpServer())
        .get(`/v1/watches/${watchId}`)
        .set(...authHeader(token));

      const url = new URL(response.body.currentOffer.purchaseUrl);
      expect(url.hostname).toBe('booking.simulated-provider.flightwatch.dev');
      expect(url.searchParams.get('marker')).toBe('fw-e2e');
      expect(url.searchParams.get('utm_source')).toBe('flightwatch');
      expect(url.searchParams.get('utm_campaign')).toBe('watch');
    } finally {
      if (previous === undefined) {
        delete process.env.AFFILIATE_TRACKING_PARAMS;
      } else {
        process.env.AFFILIATE_TRACKING_PARAMS = previous;
      }
      resetAffiliateConfigCache();
    }
  });

  // AC-007: expiresAt no passado marca EXPIRED, mas currentOffer não vira null.
  it('marks currentOffer as EXPIRED when expiresAt is in the past, without hiding it', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-06' });
    await seedObservation(watchId, { expiresAt: new Date(Date.now() - 60_000) });

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.body.currentOffer).not.toBeNull();
    expect(response.body.currentOffer.status).toBe('EXPIRED');
  });

  // AC-009: a observação mais recente é a que aparece, sem cache desatualizado.
  it('reflects the newest observation after a price change', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-07' });
    await seedObservation(watchId, {
      totalAmountMinor: 100_000,
      observedAt: new Date(Date.now() - 60_000),
    });
    await seedObservation(watchId, { totalAmountMinor: 88_000, observedAt: new Date() });

    const response = await request(app.getHttpServer())
      .get(`/v1/watches/${watchId}`)
      .set(...authHeader(token));

    expect(response.body.currentOffer.amountMinor).toBe(88_000);
  });

  // AC-008
  it('returns 404 WATCH_NOT_FOUND for a purchase-click on a watch owned by another user', async () => {
    const { watchId } = await createWatch({ departureDate: '2027-12-08' });
    const other = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/purchase-click`)
      .set(...authHeader(other.token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('WATCH_NOT_FOUND');
  });

  it('returns 404 WATCH_NOT_FOUND for a purchase-click on a nonexistent watch id', async () => {
    const { token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${randomUUID()}/purchase-click`)
      .set(...authHeader(token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('WATCH_NOT_FOUND');
  });

  it('returns 400 INVALID_WATCH_ID for a malformed id on purchase-click', async () => {
    const { token } = await createVerifiedUserWithChannel();

    const response = await request(app.getHttpServer())
      .post('/v1/watches/not-a-uuid/purchase-click')
      .set(...authHeader(token));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_WATCH_ID');
  });

  it('returns 401 when the Authorization header is missing on purchase-click', async () => {
    const response = await request(app.getHttpServer()).post(
      `/v1/watches/${randomUUID()}/purchase-click`,
    );
    expect(response.status).toBe(401);
  });

  it('records a 204 and increments watch_purchase_link_click_total with the offer status', async () => {
    const { watchId, token } = await createWatch({ departureDate: '2027-12-09' });
    await seedObservation(watchId);

    const response = await request(app.getHttpServer())
      .post(`/v1/watches/${watchId}/purchase-click`)
      .set(...authHeader(token));

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});

    const body = await metrics.registry.metrics();
    expect(body).toContain(
      'watch_purchase_link_click_total{provider="SIMULATED",status="CURRENT"}',
    );
  });
});
