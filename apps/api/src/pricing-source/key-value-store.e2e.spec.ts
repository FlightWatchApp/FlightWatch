import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryKeyValueStore, RedisKeyValueStore } from './key-value-store.js';

/** SPEC-032 — cache reconstruível da API, com Redis real. */
let container: StartedRedisContainer;
let store: RedisKeyValueStore;

beforeAll(async () => {
  container = await new RedisContainer('redis:7-alpine').start();
  store = new RedisKeyValueStore(container.getConnectionUrl());
}, 120_000);

afterAll(async () => {
  await store?.close();
  await container?.stop();
});

describe('RedisKeyValueStore', () => {
  it('grava e lê com expiração', async () => {
    await store.set('k', 'v', 200);
    expect(await store.get('k')).toBe('v');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await store.get('k')).toBeNull();
  });

  it('incrementa e a expiração vale desde a criação', async () => {
    expect(await store.increment('budget', 200)).toBe(1);
    expect(await store.increment('budget', 60_000)).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await store.increment('budget', 200)).toBe(1);
  });

  it('Redis fora falha na hora, sem segurar a requisição', async () => {
    const down = new RedisKeyValueStore('redis://127.0.0.1:1');
    const startedAt = Date.now();
    await expect(down.get('k')).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(3000);
    await down.close();
  });
});

describe('MemoryKeyValueStore', () => {
  it('mesma semântica, com relógio injetado', async () => {
    let now = 0;
    const memory = new MemoryKeyValueStore(() => now);
    await memory.set('k', 'v', 100);
    expect(await memory.increment('n', 100)).toBe(1);
    expect(await memory.increment('n', 100)).toBe(2);
    now = 100;
    expect(await memory.get('k')).toBeNull();
    expect(await memory.increment('n', 100)).toBe(1);
  });
});
