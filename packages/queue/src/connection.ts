import { Redis } from 'ioredis';

// BullMQ exige maxRetriesPerRequest: null em conexões usadas por Worker/QueueEvents
// (comandos bloqueantes não podem ter timeout de retry do ioredis).
// A URL vem sempre da configuração validada do processo (SPEC-024, REDIS_URL).
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
