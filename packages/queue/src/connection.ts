import { Redis } from 'ioredis';

// BullMQ exige maxRetriesPerRequest: null em conexões usadas por Worker/QueueEvents
// (comandos bloqueantes não podem ter timeout de retry do ioredis).
export function createRedisConnection(
  url: string = process.env.REDIS_URL ?? 'redis://localhost:6379',
): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
