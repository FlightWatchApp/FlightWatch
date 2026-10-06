import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module.js';
import { createFlightProvider } from '@flight-watch/providers';
import { AuthModule } from '../auth/auth.module.js';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { WatchesModule } from '../watches/watches.module.js';
import { FLIGHT_PROVIDER } from './flight-provider.token.js';
import { OffersController } from './offers.controller.js';
import { SearchesController } from './searches.controller.js';
import { SearchesService } from './searches.service.js';

@Module({
  imports: [AuthModule, WatchesModule, PlacesModule],
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
