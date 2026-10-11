import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';

/** CLAUDE.md §10.2 — rate limit compartilhado entre réplicas, com Redis real. */
let container: StartedRedisContainer;

beforeAll(async () => {
  container = await new RedisContainer('redis:7-alpine').start();
}, 120_000);

afterAll(async () => {
  await container?.stop();
});

describe('RedisThrottlerStorage', () => {
  it('duas réplicas contam juntas e bloqueiam acima do limite', async () => {
    const a = new RedisThrottlerStorage(container.getConnectionUrl());
    const b = new RedisThrottlerStorage(container.getConnectionUrl());
    try {
      expect((await a.increment('ip-1', 60_000, 2, 60_000, 'default')).isBlocked).toBe(false);
      expect((await b.increment('ip-1', 60_000, 2, 60_000, 'default')).totalHits).toBe(2);
      const third = await a.increment('ip-1', 60_000, 2, 60_000, 'default');
      expect(third).toMatchObject({ totalHits: 3, isBlocked: true });
      expect(third.timeToBlockExpire).toBeGreaterThan(0);
      expect(third.timeToBlockExpire).toBeLessThanOrEqual(60);
    } finally {
      a.onApplicationShutdown();
      b.onApplicationShutdown();
    }
  });

  it('throttlers e IPs diferentes não se misturam', async () => {
    const storage = new RedisThrottlerStorage(container.getConnectionUrl());
    try {
      await storage.increment('ip-2', 60_000, 1, 60_000, 'default');
      await storage.increment('ip-2', 60_000, 1, 60_000, 'default');
      expect((await storage.increment('ip-2', 60_000, 1, 60_000, 'auth')).totalHits).toBe(1);
      expect((await storage.increment('ip-3', 60_000, 1, 60_000, 'default')).totalHits).toBe(1);
    } finally {
      storage.onApplicationShutdown();
    }
  });

  it('a janela expira e a contagem recomeça', async () => {
    const storage = new RedisThrottlerStorage(container.getConnectionUrl());
    try {
      await storage.increment('ip-4', 200, 1, 200, 'default');
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect((await storage.increment('ip-4', 200, 1, 200, 'default')).totalHits).toBe(1);
    } finally {
      storage.onApplicationShutdown();
    }
  });

  it('com o Redis fora, conta em memória em vez de falhar ou liberar tudo', async () => {
    const storage = new RedisThrottlerStorage('redis://127.0.0.1:1');
    try {
      expect((await storage.increment('ip-5', 60_000, 1, 60_000, 'default')).isBlocked).toBe(false);
      expect((await storage.increment('ip-5', 60_000, 1, 60_000, 'default')).isBlocked).toBe(true);
    } finally {
      storage.onApplicationShutdown();
    }
  });
});
