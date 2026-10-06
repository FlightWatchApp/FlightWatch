import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WatchesController } from './watches.controller.js';
import { WatchesService } from './watches.service.js';

@Module({
  imports: [AuthModule, PlacesModule],
  controllers: [WatchesController],
  providers: [WatchesService],
  // SPEC-014: SearchesModule reusa WatchesService.createWatch() para
  // "derivar Watch de uma oferta" — não reimplementa fingerprint/dedup/
  // quota/idempotência.
  exports: [WatchesService],
})
export class WatchesModule {}
