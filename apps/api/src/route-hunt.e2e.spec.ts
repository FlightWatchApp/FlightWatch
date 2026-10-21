import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LOCAL_INTERNAL_API_SECRET } from '@flight-watch/config';
import * as contracts from '@flight-watch/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { registerCorrelationHook } from './observability/correlation.js';
import { KEY_VALUE_STORE, MemoryKeyValueStore } from './pricing-source/key-value-store.js';
import { PrismaService } from './prisma/prisma.service.js';
import { registerSecurityHeaders } from './security-headers.js';

/**
 * Caça a erro 500 (inspirada no `panic_hunt` do photocraft): entrada hostil em
 * TODAS as rotas da API, como anônimo, pessoa comum e admin. Toda resposta tem
 * de ser < 500 e não pode vazar detalhe interno (stack, SQL, Prisma, URL de
 * banco). As rotas vêm do Fastify e os campos vêm dos schemas de
 * `@flight-watch/contracts`: rota ou contrato novo entra na caça sozinho.
 *
 * Para a entrada hostil passar da validação e chegar ao código, cada contrato
 * é montado primeiro com valores válidos e só UM campo por vez recebe o valor
 * hostil (os schemas são estritos: um corpo genérico pararia sempre no 400).
 */

interface HuntedRoute {
  method: string;
  url: string;
}
interface Attempt {
  url: string;
  payload?: unknown;
  raw?: string;
}

const LONG = 'a'.repeat(5000);

/** Valores para cada `:param` do caminho. */
const PATH_VALUES = [
  'x',
  '00000000-0000-0000-0000-000000000000',
  randomUUID(),
  "'; DROP TABLE users;--",
  '..%2F..%2Fetc%2Fpasswd',
  '%00',
  'SAO',
  LONG,
  '9999-99-99',
];

/** Valores hostis de um campo: tamanhos no limite, vazio, injeção, tipos trocados. */
const HOSTILE_STRINGS = [
  '',
  ' ',
  'a'.repeat(50),
  'a'.repeat(65),
  LONG,
  '-1',
  '%00',
  "'; DROP TABLE users;--",
  '2026-02-30',
  '🛫✈️🛬',
];
const HOSTILE_VALUES: unknown[] = [...HOSTILE_STRINGS, -1, 0, 1e308, [], {}, null, true];

/** Corpos sem relação com contrato nenhum, mais texto cru (JSON quebrado, protótipo). */
const GENERIC_BODIES: unknown[] = [undefined, {}, [], null, 'texto', 12345];
const RAW_BODIES = [
  '{"email": "x@y.z", "password": ',
  '{"__proto__": {"role": "ADMIN"}, "constructor": {"prototype": {"role": "ADMIN"}}}',
];

/** Valor válido por nome de campo (query e corpo). Campo sem entrada fica de fora da base. */
const VALID: Record<string, unknown> = {
  q: 'sao',
  limit: 5,
  tripType: 'ONE_WAY',
  origin: 'SAO',
  destination: 'RIO',
  departureDate: '2027-01-15',
  departureDateFrom: '2027-01-10',
  departureDateTo: '2027-01-20',
  month: '2027-01',
  maxPriceMinor: 100000,
  maxStops: 1,
  currency: 'BRL',
  market: 'BR',
  cabin: 'ECONOMY',
  adults: 1,
  dateFlexibilityDays: 0,
  email: 'caca@example.com',
  password: 'a-very-long-password-123',
  timezone: 'America/Sao_Paulo',
  ttlDays: 7,
  homeCityCode: 'SAO',
  monthlyWatchLimit: 5,
  accessStatus: 'ACTIVE',
  state: 'AVAILABLE',
  token: 'x'.repeat(43),
  notificationChannelId: '00000000-0000-0000-0000-000000000000',
};

/** Campos de cada schema exportado cujo nome casa com `pattern` (desembrulha refine/transform). */
function contractFields(pattern: RegExp): string[][] {
  const lists: string[][] = [];
  for (const [name, schema] of Object.entries(contracts)) {
    if (!pattern.test(name)) continue;
    let current: unknown = schema;
    for (let depth = 0; depth < 6 && current; depth += 1) {
      const shape = (current as { shape?: Record<string, unknown> }).shape;
      if (shape) {
        lists.push(Object.keys(shape));
        break;
      }
      const def = (current as { _def?: { schema?: unknown; innerType?: unknown; in?: unknown } })
        ._def;
      current = def?.schema ?? def?.innerType ?? def?.in;
    }
  }
  return lists;
}

/** Base válida do contrato + uma variação por (campo, valor hostil). */
function fieldVariants(fields: string[], hostile: unknown[]): Array<Record<string, unknown>> {
  const base = Object.fromEntries(
    fields.filter((field) => field in VALID).map((field) => [field, VALID[field]]),
  );
  const variants: Array<Record<string, unknown>> = [base];
  for (const field of fields) {
    for (const value of hostile) variants.push({ ...base, [field]: value });
  }
  return variants;
}

function toQuery(values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Trechos que nunca podem aparecer numa resposta de erro. */
const LEAKS = [
  /\bat .+\.(ts|js):\d+/, // stack trace
  /node_modules/,
  /prisma/i,
  /\bSELECT\b|\bINSERT INTO\b/,
  /postgres(ql)?:\/\//,
  /redis:\/\//,
];

const QUERY_VARIANTS = contractFields(/QuerySchema$/).flatMap((fields) =>
  fieldVariants(fields, HOSTILE_STRINGS),
);
const BODY_VARIANTS = contractFields(/(Request|Body|Input)Schema$/).flatMap((fields) =>
  fieldVariants(fields, HOSTILE_VALUES),
);

/**
 * IP de cliente próprio (SPEC-025: o web repassa o IP autenticado pelo segredo
 * interno). Cada identidade e rota usa o seu, para o rate limit — que tem teste
 * próprio — não barrar a caça antes de a entrada chegar ao código.
 */
let nextIp = 0;
function clientIpHeaders(): Record<string, string> {
  nextIp += 1;
  return {
    [contracts.INTERNAL_SECRET_HEADER]: LOCAL_INTERNAL_API_SECRET,
    [contracts.CLIENT_IP_HEADER]: `10.${(nextIp >> 16) & 255}.${(nextIp >> 8) & 255}.${nextIp & 255}`,
  };
}

const routes: HuntedRoute[] = [];
let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(process.cwd(), '../../packages/database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const adapter = new FastifyAdapter();
  // Registrado antes do Nest montar as rotas: recebe todas elas.
  adapter.getInstance().addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== 'HEAD' && method !== 'OPTIONS') routes.push({ method, url: route.url });
    }
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(KEY_VALUE_STORE)
    .useValue(new MemoryKeyValueStore())
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(adapter);
  registerCorrelationHook(app);
  registerSecurityHeaders(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

/** Pessoa comum (ou admin) com sessão válida, criada pela própria API. */
async function signedUp(role: 'USER' | 'ADMIN'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: clientIpHeaders(),
    payload: {
      email: `${randomUUID()}@example.com`,
      password: 'a-very-long-password-123',
      timezone: 'America/Sao_Paulo',
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json<{ token: string; user: { id: string } }>();
  if (role === 'ADMIN') {
    await app.get(PrismaService).client.user.update({
      where: { id: body.user.id },
      data: { role: 'ADMIN' },
    });
  }
  return body.token;
}

function fillPath(url: string, value: string): string {
  return url.replace(/:[A-Za-z0-9_]+/g, encodeURIComponent(value).replace(/%25/g, '%'));
}

function attemptsFor(route: HuntedRoute): Attempt[] {
  const urls = route.url.includes(':')
    ? PATH_VALUES.map((value) => fillPath(route.url, value))
    : [route.url];
  const attempts: Attempt[] = [];
  for (const url of urls) {
    if (route.method === 'GET') {
      attempts.push({ url });
      // Variações de query só na primeira URL: com parâmetro de caminho
      // hostil a resposta já é 4xx antes de ler a query.
      if (url === urls[0]) {
        for (const query of QUERY_VARIANTS) attempts.push({ url: `${url}${toQuery(query)}` });
      }
    } else {
      for (const payload of GENERIC_BODIES) attempts.push({ url, payload });
      for (const raw of RAW_BODIES) attempts.push({ url, raw });
      if (url === urls[0]) {
        for (const payload of BODY_VARIANTS) attempts.push({ url, payload });
      }
    }
  }
  return attempts;
}

describe('caça a erro 500 em todas as rotas da API', () => {
  it('encontra as rotas e os contratos (sanidade da caça)', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContainEqual({ method: 'POST', url: '/v1/auth/register' });
    expect(contractFields(/QuerySchema$/).length).toBeGreaterThan(5);
    expect(contractFields(/(Request|Body|Input)Schema$/).length).toBeGreaterThan(5);
  });

  it('nenhuma rota responde 500 nem vaza detalhe interno, para nenhuma identidade', async () => {
    const identities: Array<{ name: string; role: 'USER' | 'ADMIN' | null }> = [
      { name: 'anônimo', role: null },
      { name: 'pessoa', role: 'USER' },
      { name: 'admin', role: 'ADMIN' },
    ];

    const failures: string[] = [];
    let requests = 0;
    let authenticated = 0;
    let authenticatedRequests = 0;
    for (const identity of identities) {
      for (const route of routes) {
        // Sessão nova por rota: logout e exclusão de conta encerram a sessão e
        // deixariam o resto da caça só com 401.
        const token = identity.role ? await signedUp(identity.role) : null;
        const headers = {
          ...clientIpHeaders(),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        };

        for (const attempt of attemptsFor(route)) {
          requests += 1;
          const hasBody = attempt.raw !== undefined || attempt.payload !== undefined;
          const response = await app.inject({
            method: route.method as 'GET',
            url: attempt.url,
            headers: { ...headers, ...(hasBody ? { 'content-type': 'application/json' } : {}) },
            ...(attempt.raw !== undefined
              ? { payload: attempt.raw }
              : attempt.payload !== undefined
                ? { payload: JSON.stringify(attempt.payload) }
                : {}),
          });
          if (token) {
            authenticatedRequests += 1;
            if (response.statusCode !== 401) authenticated += 1;
          }
          const sent = attempt.payload !== undefined ? JSON.stringify(attempt.payload) : '';
          const where = `${identity.name} ${route.method} ${attempt.url.slice(0, 120)} ${sent.slice(0, 120)}`;
          if (response.statusCode >= 500) {
            failures.push(`${where} → ${response.statusCode} ${response.body.slice(0, 200)}`);
          } else if (response.statusCode >= 400) {
            const leak = LEAKS.find((pattern) => pattern.test(response.body));
            if (leak) failures.push(`${where} → vazou ${leak}: ${response.body.slice(0, 200)}`);
          }
        }
      }
    }

    expect(requests).toBeGreaterThan(5000);
    // Sanidade: quase todas as tentativas logadas passaram da autenticação.
    expect(authenticated).toBeGreaterThan(authenticatedRequests * 0.9);
    expect(failures, failures.slice(0, 30).join('\n')).toEqual([]);
  }, 600_000);

  it('/metrics não existe na porta pública e /health não traz detalhe interno', async () => {
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(404);

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBeLessThan(500);
    for (const pattern of LEAKS) expect(health.body).not.toMatch(pattern);
    expect(health.body).not.toMatch(/version|host|database|error/i);
  });
});
