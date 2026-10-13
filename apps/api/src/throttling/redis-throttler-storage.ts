import { Redis } from 'ioredis';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { logEvent } from '@flight-watch/observability';

/** Depois de uma falha, volta a tentar o Redis só passado este intervalo. */
const RETRY_AFTER_FAILURE_MS = 5000;
const ERROR_LOG_INTERVAL_MS = 60_000;

/** INCR + expiração na primeira batida + TTL restante, numa operação só. */
const HIT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {hits, redis.call('PTTL', KEYS[1])}
`;

/**
 * Armazenamento do rate limit compartilhado entre réplicas da API (CLAUDE.md
 * §10.2). Janela fixa de `ttl`; ao passar do limite, o bloqueio dura até o fim
 * da janela. Redis fora não derruba nem libera a API: cada processo volta a
 * contar em memória (o comportamento anterior) até o Redis voltar.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly client: Redis;
  private readonly fallback = new ThrottlerStorageService();
  private skipRedisUntil = 0;
  private lastErrorLogAt = 0;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 300,
    });
    this.client.on('error', () => undefined); // tratado em increment()
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (Date.now() < this.skipRedisUntil) {
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    try {
      if (this.client.status === 'wait') await this.client.connect();
      const [hits, pttl] = (await this.client.eval(
        HIT_SCRIPT,
        1,
        `throttle:v1:${throttlerName}:${key}`,
        String(ttl),
      )) as [number, number];
      const timeToExpire = Math.max(0, Math.ceil(pttl / 1000));
      const isBlocked = hits > limit;
      return {
        totalHits: hits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire: isBlocked ? timeToExpire : 0,
      };
    } catch (error) {
      this.skipRedisUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
      const now = Date.now();
      if (now - this.lastErrorLogAt >= ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLogAt = now;
        logEvent({
          event: 'throttler_storage_unavailable',
          errorName: error instanceof Error ? error.name : 'unknown',
        });
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  /** Chamado pelo Nest no encerramento (a classe é um provider do módulo). */
  onApplicationShutdown(): void {
    this.client.disconnect();
    this.fallback.onApplicationShutdown();
  }
}
