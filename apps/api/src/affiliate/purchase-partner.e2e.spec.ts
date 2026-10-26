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

/**
 * SPEC-044 — com `PURCHASE_PARTNER=decolar`, todo botão de compra da API leva à
 * busca da Decolar, montada pela viagem, mesmo que a observação gravada traga
 * o link da fonte de preços. Com a fonte simulada, o link de antes é o do
 * "booking" simulado: se ele aparecer em qualquer resposta, o parceiro vazou.
 */

const DECOLAR_HOST = 'www.decolar.com';
const SIMULATED_HOST = 'booking.simulated-provider.flightwatch.dev';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let prisma: PrismaClient;
const originalPartner = process.env.PURCHASE_PARTNER;

beforeAll(async () => {
  process.env.PURCHASE_PARTNER = 'decolar';
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
  await syncPlacesCatalog(prisma, TEST_PLACES, new Date());
}, 120_000);

afterAll(async () => {
  if (originalPartner === undefined) delete process.env.PURCHASE_PARTNER;
  else process.env.PURCHASE_PARTNER = originalPartner;
  await app?.close();
  await container?.stop();
});

async function verifiedUser(): Promise<{ token: string; channelId: string }> {
  const registered = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({
      email: `${randomUUID()}@example.com`,
      password: 'a-very-long-password-123',
      timezone: 'America/Sao_Paulo',
    });
  const channelId = registered.body.user.notificationChannelId as string;
  await prisma.notificationChannel.update({
    where: { id: channelId },
    data: { verifiedAt: new Date() },
  });
  return { token: registered.body.token as string, channelId };
}

const trip = (overrides: Record<string, unknown> = {}) => ({
  origin: 'DOU',
  destination: 'GRU',
  tripType: 'ONE_WAY',
  departureDate: '2027-12-01',
  returnDate: null,
  cabin: 'ECONOMY',
  adults: 1,
  currency: 'BRL',
  market: 'BR',
  ...overrides,
});

describe('parceiro de compra = decolar (SPEC-044)', () => {
  it('monitoramento: o link é a busca da Decolar da viagem, não o endereço gravado', async () => {
    const { token, channelId } = await verifiedUser();
    const created = await request(app.getHttpServer())
      .post('/v1/watches')
      .set('authorization', `Bearer ${token}`)
      .send({
        ...trip({ tripType: 'ROUND_TRIP', returnDate: '2027-12-08' }),
        notificationChannelId: channelId,
      });
    expect(created.status).toBe(201);

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
    await prisma.priceObservation.create({
      data: {
        searchTargetId: watch.searchTargetId,
        searchExecutionId: execution.id,
        providerStrategy: 'SIMULATED',
        observedAt: new Date(),
        totalAmountMinor: 90_000,
        currency: 'BRL',
        itinerary: [],
        offerSignature: randomUUID(),
        qualityFlags: [],
        observationKey: randomUUID(),
        selectionPolicyVersion: 1,
        normalizerVersion: 1,
        // O link gravado é o da fonte; ele não pode chegar ao cliente.
        deeplink: `https://${SIMULATED_HOST}/checkout/${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    // GRU (aeroporto) vira SAO (cidade) no cadastro do monitoramento (SPEC-029): o
    // código de cidade é o que a Decolar espera.
    const expected =
      'https://www.decolar.com/shop/flights/results/multioneway/DOU/SAO/2027-12-01/2027-12-08/1/0/0?from=SB&di=1&isRedirectFromRoundtrip=true';
    const list = await request(app.getHttpServer())
      .get('/v1/watches')
      .set('authorization', `Bearer ${token}`);
    const item = list.body.watches.find((w: { id: string }) => w.id === created.body.id);
    expect(item.currentOffer.purchaseUrl, 'lista').toBe(expected);

    const detail = await request(app.getHttpServer())
      .get(`/v1/watches/${created.body.id}`)
      .set('authorization', `Bearer ${token}`);
    expect(detail.body.currentOffer.purchaseUrl).toBe(expected);
    expect(JSON.stringify(list.body)).not.toContain(SIMULATED_HOST);
  });

  it('busca: ofertas e "ver todos os voos" levam à Decolar', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/searches/flights')
      .send(trip({ departureDate: '2027-12-03' }));
    expect(response.status).toBe(201);
    expect(response.body.offers.length).toBeGreaterThan(0);

    expect(response.body.allFlightsUrl).toBe(
      'https://www.decolar.com/shop/flights/results/oneway/DOU/SAO/2027-12-03/1/0/0?from=SB&di=1',
    );
    for (const offer of response.body.offers) {
      expect(new URL(offer.purchaseUrl).host).toBe(DECOLAR_HOST);
    }
    expect(JSON.stringify(response.body)).not.toContain(SIMULATED_HOST);

    // A busca lida de volta pelo id também.
    const again = await request(app.getHttpServer()).get(
      `/v1/searches/flights/${response.body.id}`,
    );
    expect(again.body.allFlightsUrl).toBe(response.body.allFlightsUrl);
    expect(new URL(again.body.offers[0].purchaseUrl).host).toBe(DECOLAR_HOST);
  });
});
