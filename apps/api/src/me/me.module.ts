import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlacesModule } from '../places/places.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { WatchesModule } from '../watches/watches.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

@Module({
  imports: [AuthModule, PlacesModule, PromotionsModule, WatchesModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
