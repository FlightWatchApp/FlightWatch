import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WatchesModule } from '../watches/watches.module.js';
import { OffersController } from './offers.controller.js';
import { PriceCalendarController } from './price-calendar.controller.js';
import { SearchesController } from './searches.controller.js';
import { SearchesService } from './searches.service.js';

@Module({
  imports: [AuthModule, WatchesModule, PlacesModule],
  controllers: [SearchesController, OffersController, PriceCalendarController],
  // FLIGHT_PROVIDER e o cache do calendário vêm do PricingSourceModule (global).
  providers: [SearchesService],
})
export class SearchesModule {}
