import { Redis } from 'ioredis';
import { logEvent } from '@flight-watch/observability';

/**
 * SPEC-032: cache reconstruível da API (promoções, calendário por rota-mês,
 * orçamento do dia). Nada aqui é fonte de verdade — Redis fora é falta de
 * cache, nunca erro para quem pediu. Quem chama trata a falha.
 */
export const KEY_VALUE_STORE = Symbol('KEY_VALUE_STORE');

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** Soma 1 e devolve o novo valor; a chave expira `ttlMs` depois de criada. */
  increment(key: string, ttlMs: number): Promise<number>;
  close(): Promise<void>;
}

/** Em memória, por processo: testes e fallback. */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  /** Sem `await` entre ler e gravar: atômico como o INCR do Redis. */
  async increment(key: string, ttlMs: number): Promise<number> {
    const now = this.now();
    const entry = this.entries.get(key);
    const live = entry && entry.expiresAt > now ? entry : undefined;
    const next = (live ? Number(live.value) : 0) + 1;
    this.entries.set(key, { value: String(next), expiresAt: live?.expiresAt ?? now + ttlMs });
    return next;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

const ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Sem fila offline e com timeout curto: com o Redis fora, o comando falha na
 * hora em vez de segurar a requisição. Conecta só no primeiro uso.
 */
export class RedisKeyValueStore implements KeyValueStore {
  private readonly client: Redis;
  private lastErrorLogAt = 0;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 500,
    });
    // Sem ouvinte, o erro de conexão derruba o processo. Registrado no
    // máximo uma vez por minuto (o ioredis tenta reconectar sozinho).
    this.client.on('error', (error: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLogAt >= ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLogAt = now;
        logEvent({ event: 'api_cache_unavailable', errorName: error.name });
      }
    });
  }

  private async ready(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async get(key: string): Promise<string | null> {
    await this.ready();
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.ready();
    await this.client.set(key, value, 'PX', ttlMs);
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    await this.ready();
    const value = await this.client.incr(key);
    if (value === 1) {
      await this.client.pexpire(key, ttlMs);
    }
    return value;
  }

  async close(): Promise<void> {
    this.client.disconnect();
  }
}
