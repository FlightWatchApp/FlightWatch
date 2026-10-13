import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { resolveClientIp } from './client-ip.js';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';

const THROTTLER_STORAGE = Symbol('THROTTLER_STORAGE');

/** Dono do ciclo de vida da conexão Redis do rate limit (fecha no shutdown). */
@Module({
  providers: [
    {
      provide: THROTTLER_STORAGE,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => new RedisThrottlerStorage(config.REDIS_URL),
    },
  ],
  exports: [THROTTLER_STORAGE],
})
class ThrottlerStorageModule {}

/**
 * SPEC-025: throttlers nomeados, contados por rota e por IP do cliente.
 * `ThrottlerModule` é global; cada rota limitada usa o guard do próprio módulo
 * (formato de erro) e pula o throttler que não é dela com `@SkipThrottle`.
 *
 * Storage no Redis, compartilhado entre réplicas; com o Redis fora, cada
 * processo conta em memória até ele voltar (CLAUDE.md §10.2).
 */
export const SEARCH_THROTTLER = 'default';
export const AUTH_THROTTLER = 'auth';
/** SPEC-033: páginas de conteúdo público (página da rota), mais folgado que a busca. */
export const PAGES_THROTTLER = 'pages';

interface TrackedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [API_CONFIG, THROTTLER_STORAGE],
      useFactory: (config: ApiConfig, storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: SEARCH_THROTTLER,
            ttl: config.RATE_LIMIT_WINDOW_MS,
            limit: config.RATE_LIMIT_MAX,
          },
          {
            name: AUTH_THROTTLER,
            ttl: config.AUTH_RATE_LIMIT_WINDOW_MS,
            limit: config.AUTH_RATE_LIMIT_MAX,
          },
          {
            name: PAGES_THROTTLER,
            ttl: config.RATE_LIMIT_WINDOW_MS,
            limit: config.ROUTE_PAGE_RATE_LIMIT_MAX,
          },
        ],
        getTracker: (request: Record<string, unknown>) => {
          const { headers, ip } = request as unknown as TrackedRequest;
          return resolveClientIp(headers, ip, config.INTERNAL_API_SECRET);
        },
      }),
    }),
  ],
})
export class ThrottlingModule {}
