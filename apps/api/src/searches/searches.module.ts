import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { createFlightProvider } from '@flight-watch/providers';
import { AuthModule } from '../auth/auth.module.js';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { WatchesModule } from '../watches/watches.module.js';
import { FLIGHT_PROVIDER } from './flight-provider.token.js';
import { OffersController } from './offers.controller.js';
import { SearchesController } from './searches.controller.js';
import { SearchesService } from './searches.service.js';

@Module({
  imports: [
    AuthModule,
    WatchesModule,
    // SPEC-014 §"Segurança e privacidade": RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX,
    // validadas pela SPEC-024.
    ThrottlerModule.forRootAsync({
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => [
        { name: 'default', ttl: config.RATE_LIMIT_WINDOW_MS, limit: config.RATE_LIMIT_MAX },
      ],
    }),
  ],
  controllers: [SearchesController, OffersController],
  providers: [
    SearchesService,
    {
      provide: FLIGHT_PROVIDER,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => createFlightProvider(config.FLIGHT_PROVIDER),
    },
  ],
})
export class SearchesModule {}
