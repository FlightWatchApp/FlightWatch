import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';

@Module({
  imports: [PlacesModule, PromotionsModule],
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
