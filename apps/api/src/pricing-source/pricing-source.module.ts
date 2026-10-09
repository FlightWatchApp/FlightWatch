import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createFlightProvider } from '@flight-watch/providers';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { FLIGHT_PROVIDER } from '../searches/flight-provider.token.js';
import { KEY_VALUE_STORE, type KeyValueStore, RedisKeyValueStore } from './key-value-store.js';
import { PriceCalendarCache } from './price-calendar-cache.js';
import { ProviderCooldown } from './provider-guard.js';

/**
 * Fonte de preços da API: o provedor (ADR-004), o cache reconstruível
 * (SPEC-032) e o calendário por rota-mês, compartilhados pela busca e pelas
 * promoções.
 */
@Global()
@Module({
  providers: [
    {
      provide: FLIGHT_PROVIDER,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) =>
        createFlightProvider({
          kind: config.FLIGHT_PROVIDER,
          travelpayoutsToken: config.TRAVELPAYOUTS_TOKEN,
          timeoutMs: config.FLIGHT_PROVIDER_TIMEOUT_MS,
        }),
    },
    {
      provide: KEY_VALUE_STORE,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => new RedisKeyValueStore(config.REDIS_URL),
    },
    PriceCalendarCache,
    ProviderCooldown,
  ],
  exports: [FLIGHT_PROVIDER, KEY_VALUE_STORE, PriceCalendarCache, ProviderCooldown],
})
export class PricingSourceModule implements OnModuleDestroy {
  constructor(@Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore) {}

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }
}
