import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './load.js';
import {
  alertWorkerConfig,
  apiConfig,
  notificationWorkerConfig,
  priceWorkerConfig,
  schedulerConfig,
} from './processes.js';

const PRODUCTION_BASE = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  DATABASE_URL: 'postgresql://app:s3cr3t-db-password@db.internal:5432/flight_watch',
  REDIS_URL: 'redis://cache.internal:6379',
  WEB_BASE_URL: 'https://flightwatch.example',
};

function configErrorOf(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error('esperava ConfigError, mas a configuração foi aceita');
}

function keysOf(error: ConfigError): string[] {
  return error.issues.map((issue) => issue.key);
}

describe('SPEC-024 AC-1 — valor inválido impede o startup', () => {
  it('rejeita número não inteiro e nomeia a chave', () => {
    const error = configErrorOf(() =>
      loadConfig(priceWorkerConfig, { PRICE_WORKER_CONCURRENCY: 'cinco' }),
    );
    expect(keysOf(error)).toEqual(['PRICE_WORKER_CONCURRENCY']);
    expect(error.message).toContain('PRICE_WORKER_CONCURRENCY');
  });

  it('rejeita porta fora da faixa', () => {
    const error = configErrorOf(() => loadConfig(apiConfig, { PORT: '70000' }));
    expect(keysOf(error)).toEqual(['PORT']);
  });

  it('rejeita URL com protocolo errado', () => {
    const error = configErrorOf(() =>
      loadConfig(schedulerConfig, { DATABASE_URL: 'mysql://localhost/db' }),
    );
    expect(keysOf(error)).toEqual(['DATABASE_URL']);
  });

  it('rejeita adapter desconhecido', () => {
    const error = configErrorOf(() => loadConfig(apiConfig, { FLIGHT_PROVIDER: 'duffel' }));
    expect(keysOf(error)).toEqual(['FLIGHT_PROVIDER']);
  });

  it('reúne todos os problemas num erro só', () => {
    const error = configErrorOf(() =>
      loadConfig(apiConfig, { PORT: 'x', RATE_LIMIT_MAX: '-1', EMAIL_PROVIDER: 'smtp' }),
    );
    expect(keysOf(error).sort()).toEqual(['EMAIL_PROVIDER', 'PORT', 'RATE_LIMIT_MAX']);
  });
});

describe('SPEC-024 AC-2 — trava de produção para adapters simulados', () => {
  it('rejeita FLIGHT_PROVIDER e EMAIL_PROVIDER simulados em produção', () => {
    const error = configErrorOf(() => loadConfig(apiConfig, { ...PRODUCTION_BASE }));
    expect(keysOf(error).sort()).toEqual(['EMAIL_PROVIDER', 'FLIGHT_PROVIDER']);
    expect(error.message).toContain('APP_ENV=production');
  });

  it('rejeita o adapter simulado de cada worker em produção', () => {
    expect(keysOf(configErrorOf(() => loadConfig(priceWorkerConfig, PRODUCTION_BASE)))).toEqual([
      'FLIGHT_PROVIDER',
    ]);
    expect(
      keysOf(configErrorOf(() => loadConfig(notificationWorkerConfig, PRODUCTION_BASE))),
    ).toEqual(['EMAIL_PROVIDER']);
  });

  it('permite adapters simulados em staging', () => {
    const config = loadConfig(apiConfig, { ...PRODUCTION_BASE, APP_ENV: 'staging' });
    expect(config.APP_ENV).toBe('staging');
    expect(config.FLIGHT_PROVIDER).toBe('simulated');
  });

  it('não afeta processos sem adapter externo', () => {
    const config = loadConfig(alertWorkerConfig, PRODUCTION_BASE);
    expect(config.APP_ENV).toBe('production');
  });
});

describe('SPEC-024 AC-3 — APP_ENV obrigatória com NODE_ENV=production', () => {
  it('rejeita NODE_ENV=production sem APP_ENV', () => {
    const env = Object.fromEntries(
      Object.entries(PRODUCTION_BASE).filter(([key]) => key !== 'APP_ENV'),
    );
    const error = configErrorOf(() => loadConfig(alertWorkerConfig, env));
    expect(keysOf(error)).toEqual(['APP_ENV']);
  });

  it('resolve APP_ENV a partir de NODE_ENV fora de produção', () => {
    expect(loadConfig(alertWorkerConfig, {}).APP_ENV).toBe('development');
    expect(loadConfig(alertWorkerConfig, { NODE_ENV: 'test' }).APP_ENV).toBe('test');
  });

  it('rejeita APP_ENV desconhecido', () => {
    const error = configErrorOf(() => loadConfig(alertWorkerConfig, { APP_ENV: 'prod' }));
    expect(keysOf(error)).toEqual(['APP_ENV']);
  });
});

describe('SPEC-024 AC-4 — padrões locais só em development/test', () => {
  it.each(['staging', 'production'])(
    'exige DATABASE_URL, REDIS_URL e WEB_BASE_URL em %s',
    (appEnv) => {
      const error = configErrorOf(() =>
        loadConfig(notificationWorkerConfig, {
          NODE_ENV: 'production',
          APP_ENV: appEnv,
          EMAIL_PROVIDER: 'simulated',
        }),
      );
      const keys = keysOf(error).filter((key) => key !== 'EMAIL_PROVIDER');
      expect(keys.sort()).toEqual(['DATABASE_URL', 'REDIS_URL', 'WEB_BASE_URL']);
    },
  );

  it('valor vazio conta como ausente', () => {
    const error = configErrorOf(() =>
      loadConfig(schedulerConfig, { ...PRODUCTION_BASE, APP_ENV: 'staging', DATABASE_URL: '  ' }),
    );
    expect(keysOf(error)).toEqual(['DATABASE_URL']);
  });
});

describe('SPEC-024 AC-5 — padrões de desenvolvimento iguais aos de antes', () => {
  const LOCAL_DATABASE_URL = 'postgresql://flight_watch:flight_watch@localhost:5432/flight_watch';

  it('api', () => {
    expect(loadConfig(apiConfig, {})).toEqual({
      NODE_ENV: 'development',
      APP_ENV: 'development',
      PORT: 3000,
      METRICS_HOST: '127.0.0.1',
      METRICS_PORT: 9100,
      DATABASE_URL: LOCAL_DATABASE_URL,
      WEB_BASE_URL: 'http://localhost:3100',
      FLIGHT_PROVIDER: 'simulated',
      EMAIL_PROVIDER: 'simulated',
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_MAX: 10,
    });
  });

  it('scheduler', () => {
    expect(loadConfig(schedulerConfig, {})).toMatchObject({
      METRICS_PORT: 9101,
      REDIS_URL: 'redis://localhost:6379',
      SCHEDULER_TICK_INTERVAL_MS: 5000,
    });
  });

  it('price-worker', () => {
    expect(loadConfig(priceWorkerConfig, {})).toMatchObject({
      METRICS_PORT: 9102,
      FLIGHT_PROVIDER: 'simulated',
      PRICE_WORKER_CONCURRENCY: 5,
      PRICE_WORKER_RATE_LIMIT_CAPACITY: 10,
      PRICE_WORKER_RATE_LIMIT_PER_SECOND: 5,
      PRICE_WORKER_CIRCUIT_FAILURE_THRESHOLD: 5,
      PRICE_WORKER_CIRCUIT_RESET_TIMEOUT_MS: 30_000,
    });
  });

  it('alert-worker', () => {
    expect(loadConfig(alertWorkerConfig, {})).toMatchObject({
      METRICS_PORT: 9103,
      ALERT_WORKER_CONCURRENCY: 5,
    });
  });

  it('notification-worker (WEB_BASE_URL corrigido para o web, porta 3100)', () => {
    expect(loadConfig(notificationWorkerConfig, {})).toMatchObject({
      METRICS_PORT: 9104,
      WEB_BASE_URL: 'http://localhost:3100',
      EMAIL_PROVIDER: 'simulated',
      NOTIFICATION_WORKER_CONCURRENCY: 5,
      NOTIFICATION_STALE_SENDING_THRESHOLD_MS: 300_000,
      NOTIFICATION_STALE_SENDING_SWEEP_INTERVAL_MS: 60_000,
    });
  });

  it('valores explícitos sobrescrevem os padrões', () => {
    const config = loadConfig(priceWorkerConfig, {
      PRICE_WORKER_CONCURRENCY: '12',
      METRICS_PORT: '9300',
    });
    expect(config.PRICE_WORKER_CONCURRENCY).toBe(12);
    expect(config.METRICS_PORT).toBe(9300);
  });
});

describe('SPEC-024 AC-6 — o erro nunca expõe o valor recebido', () => {
  it('não inclui segredos nem valores inválidos na mensagem ou nos issues', () => {
    const secret = 's3cr3t-db-password';
    const error = configErrorOf(() =>
      loadConfig(apiConfig, {
        ...PRODUCTION_BASE,
        DATABASE_URL: `mysql://app:${secret}@db.internal/x`,
        PORT: 'porta-secreta-123',
        FLIGHT_PROVIDER: 'valor-secreto-xyz',
      }),
    );
    const serialized = JSON.stringify({
      message: error.message,
      issues: error.issues,
      log: error.toLogEvent(),
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('porta-secreta-123');
    expect(serialized).not.toContain('valor-secreto-xyz');
  });

  it('gera evento de log config_invalid com o serviço e as chaves', () => {
    const error = configErrorOf(() => loadConfig(apiConfig, { PORT: 'x' }));
    expect(error.toLogEvent()).toEqual({
      event: 'config_invalid',
      service: 'api',
      issues: [{ key: 'PORT', message: expect.any(String) }],
    });
  });
});
