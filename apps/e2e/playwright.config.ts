import { defineConfig, devices } from '@playwright/test';
import { API_URL, INVITE_API_URL, INVITE_PORTS, PORTS, SHARED_ENV, WEB_URL } from './env';

const worker = (name: string, metricsPort: number) => ({
  command: `pnpm --filter @flight-watch/${name} start`,
  url: `http://127.0.0.1:${metricsPort}/metrics`,
  env: { ...SHARED_ENV, SERVICE_NAME: name, METRICS_PORT: String(metricsPort) },
  reuseExistingServer: false,
  timeout: 180_000,
});

export default defineConfig({
  testDir: './tests',
  // Um fluxo depende do anterior só dentro do próprio arquivo; arquivos seguem em série
  // porque dividem o mesmo banco e os mesmos workers.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Campo_Grande',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: '(pnpm --filter @flight-watch/api start)',
      url: `${API_URL}/health`,
      env: {
        ...SHARED_ENV,
        SERVICE_NAME: 'api',
        PORT: String(PORTS.api),
        METRICS_PORT: String(PORTS.metrics[0]),
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // SPEC-043: API com convite obrigatório e cota mensal pequena, só para invite-access.spec.ts.
      command: '(pnpm --filter @flight-watch/api start)',
      url: `${INVITE_API_URL}/health`,
      env: {
        ...SHARED_ENV,
        SERVICE_NAME: 'api',
        PORT: String(INVITE_PORTS.api),
        METRICS_PORT: String(INVITE_PORTS.metrics),
        INVITE_REQUIRED: 'true',
        MONTHLY_WATCH_LIMIT: '2',
        WEB_BASE_URL: `http://127.0.0.1:${INVITE_PORTS.web}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    worker('scheduler', PORTS.metrics[1]),
    worker('price-worker', PORTS.metrics[2]),
    worker('alert-worker', PORTS.metrics[3]),
    worker('notification-worker', PORTS.metrics[4]),
    {
      command: `pnpm --filter @flight-watch/web exec next start --port ${PORTS.web} --hostname 127.0.0.1`,
      url: WEB_URL,
      env: { ...SHARED_ENV, API_BASE_URL: API_URL, NODE_ENV: 'production' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @flight-watch/web exec next start --port ${INVITE_PORTS.web} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${INVITE_PORTS.web}`,
      env: { ...SHARED_ENV, API_BASE_URL: INVITE_API_URL, NODE_ENV: 'production' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
