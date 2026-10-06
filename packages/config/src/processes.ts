import {
  durationMsField,
  enumField,
  hostField,
  intField,
  portField,
  secretField,
  urlField,
} from './fields.js';

/**
 * SPEC-024 — o que cada processo lê. Os padrões repetem os valores que viviam
 * espalhados em `process.env.X ?? padrão` antes desta spec (AC-5).
 */

/** Adapters disponíveis. Um adapter real entra aqui e na factory do pacote dele. */
export const FLIGHT_PROVIDERS = ['simulated'] as const;
export const EMAIL_PROVIDERS = ['simulated'] as const;

const LOCAL_DATABASE_URL = 'postgresql://flight_watch:flight_watch@localhost:5432/flight_watch';
const LOCAL_REDIS_URL = 'redis://localhost:6379';
const LOCAL_WEB_BASE_URL = 'http://localhost:3100';
/**
 * SPEC-025: segredo BFF → API em desenvolvimento. Exportado para o apps/web
 * usar o mesmo valor localmente; rejeitado fora de development/test.
 */
export const LOCAL_INTERNAL_API_SECRET = 'local-development-internal-api-secret';

const concurrency = () => intField({ min: 1, max: 100, default: 5 });

function metrics(defaultPort: number) {
  return { METRICS_HOST: hostField('127.0.0.1'), METRICS_PORT: portField(defaultPort) };
}

const database = { DATABASE_URL: urlField(['postgresql:', 'postgres:']) };
const redis = { REDIS_URL: urlField(['redis:', 'rediss:']) };
const webBaseUrl = { WEB_BASE_URL: urlField(['http:', 'https:']) };
const flightProvider = { FLIGHT_PROVIDER: enumField(FLIGHT_PROVIDERS, 'simulated') };
const emailProvider = { EMAIL_PROVIDER: enumField(EMAIL_PROVIDERS, 'simulated') };

export const apiConfig = {
  service: 'api',
  shape: {
    PORT: portField(3000),
    ...metrics(9100),
    ...database,
    ...webBaseUrl,
    ...flightProvider,
    ...emailProvider,
    RATE_LIMIT_WINDOW_MS: durationMsField(60_000),
    RATE_LIMIT_MAX: intField({ min: 1, max: 10_000, default: 10 }),
    // SPEC-025: rotas de autenticação, por rota e por IP do cliente.
    AUTH_RATE_LIMIT_WINDOW_MS: durationMsField(10 * 60 * 1000),
    AUTH_RATE_LIMIT_MAX: intField({ min: 1, max: 10_000, default: 20 }),
    INTERNAL_API_SECRET: secretField(32),
  },
  localDefaults: {
    DATABASE_URL: LOCAL_DATABASE_URL,
    WEB_BASE_URL: LOCAL_WEB_BASE_URL,
    INTERNAL_API_SECRET: LOCAL_INTERNAL_API_SECRET,
  },
};

export const schedulerConfig = {
  service: 'scheduler',
  shape: {
    ...metrics(9101),
    ...database,
    ...redis,
    SCHEDULER_TICK_INTERVAL_MS: durationMsField(5000),
  },
  localDefaults: { DATABASE_URL: LOCAL_DATABASE_URL, REDIS_URL: LOCAL_REDIS_URL },
};

export const priceWorkerConfig = {
  service: 'price-worker',
  shape: {
    ...metrics(9102),
    ...database,
    ...redis,
    ...flightProvider,
    PRICE_WORKER_CONCURRENCY: concurrency(),
    PRICE_WORKER_RATE_LIMIT_CAPACITY: intField({ min: 1, max: 10_000, default: 10 }),
    PRICE_WORKER_RATE_LIMIT_PER_SECOND: intField({ min: 1, max: 10_000, default: 5 }),
    PRICE_WORKER_CIRCUIT_FAILURE_THRESHOLD: intField({ min: 1, max: 1000, default: 5 }),
    PRICE_WORKER_CIRCUIT_RESET_TIMEOUT_MS: durationMsField(30_000),
  },
  localDefaults: { DATABASE_URL: LOCAL_DATABASE_URL, REDIS_URL: LOCAL_REDIS_URL },
};

export const alertWorkerConfig = {
  service: 'alert-worker',
  shape: {
    ...metrics(9103),
    ...database,
    ...redis,
    ALERT_WORKER_CONCURRENCY: concurrency(),
  },
  localDefaults: { DATABASE_URL: LOCAL_DATABASE_URL, REDIS_URL: LOCAL_REDIS_URL },
};

export const notificationWorkerConfig = {
  service: 'notification-worker',
  shape: {
    ...metrics(9104),
    ...database,
    ...redis,
    ...webBaseUrl,
    ...emailProvider,
    NOTIFICATION_WORKER_CONCURRENCY: concurrency(),
    NOTIFICATION_STALE_SENDING_THRESHOLD_MS: durationMsField(5 * 60 * 1000),
    NOTIFICATION_STALE_SENDING_SWEEP_INTERVAL_MS: durationMsField(60_000),
  },
  localDefaults: {
    DATABASE_URL: LOCAL_DATABASE_URL,
    REDIS_URL: LOCAL_REDIS_URL,
    WEB_BASE_URL: LOCAL_WEB_BASE_URL,
  },
};

export const ALL_CONFIG_DEFINITIONS = {
  api: apiConfig,
  scheduler: schedulerConfig,
  priceWorker: priceWorkerConfig,
  alertWorker: alertWorkerConfig,
  notificationWorker: notificationWorkerConfig,
};

/**
 * Chaves do `.env.example` validadas fora deste pacote (SPEC-024 AC-7):
 * - `AFFILIATE_TRACKING_PARAMS`: parser próprio da SPEC-020 na API;
 * - `API_BASE_URL`: lida pelo `apps/web` (config do web fica para a spec de deploy).
 */
export const KEYS_VALIDATED_ELSEWHERE: readonly string[] = [
  'AFFILIATE_TRACKING_PARAMS',
  'API_BASE_URL',
];
