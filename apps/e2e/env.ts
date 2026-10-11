import { resolve } from 'node:path';

/**
 * Ambiente isolado do E2E: banco e Redis (db 9) próprios, portas próprias,
 * provedores simulados e e-mails gravados em arquivo. Nada aqui encosta no
 * banco de desenvolvimento nem nas filas dos workers do Compose.
 */
export const PORTS = { api: 3300, web: 3400, metrics: [9301, 9302, 9303, 9304, 9305] } as const;

export const WEB_URL = `http://127.0.0.1:${PORTS.web}`;
export const API_URL = `http://127.0.0.1:${PORTS.api}`;

const PG_BASE =
  process.env.E2E_PG_BASE_URL ?? 'postgresql://flight_watch:flight_watch@127.0.0.1:5432';
export const E2E_DB_NAME = 'flight_watch_e2e';
export const ADMIN_DATABASE_URL = `${PG_BASE}/postgres`;
export const DATABASE_URL = `${PG_BASE}/${E2E_DB_NAME}`;
export const REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379/9';
export const MAILBOX_DIR = resolve(import.meta.dirname, '.mailbox');
const INTERNAL_API_SECRET = 'e2e-internal-secret-not-for-real-deploys';

export const SHARED_ENV: Record<string, string> = {
  APP_ENV: 'test',
  LOG_LEVEL: 'warn',
  DATABASE_URL,
  REDIS_URL,
  WEB_BASE_URL: WEB_URL,
  INTERNAL_API_SECRET,
  FLIGHT_PROVIDER: 'simulated',
  EMAIL_PROVIDER: 'simulated',
  EMAIL_OUTBOX_DIR: MAILBOX_DIR,
  // O E2E cria várias contas e buscas do mesmo IP em poucos minutos.
  RATE_LIMIT_MAX: '1000',
  AUTH_RATE_LIMIT_MAX: '1000',
  ROUTE_PAGE_RATE_LIMIT_MAX: '1000',
  PROMOTION_ENGINE_ENABLED: 'true',
  ROUTE_PAGE_ENABLED: 'true',
};
