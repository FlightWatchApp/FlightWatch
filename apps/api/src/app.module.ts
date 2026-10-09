import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { OpportunitiesModule } from './opportunities/opportunities.module.js';
import { PlacesModule } from './places/places.module.js';
import { PricingSourceModule } from './pricing-source/pricing-source.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { RoutesModule } from './routes/routes.module.js';
import { SearchesModule } from './searches/searches.module.js';
import { ThrottlingModule } from './throttling/throttling.module.js';
import { WatchesModule } from './watches/watches.module.js';

@Module({
  imports: [
    ConfigModule,
    ThrottlingModule,
    PrismaModule,
    ObservabilityModule,
    PricingSourceModule,
    AuthModule,
    WatchesModule,
    SearchesModule,
    OpportunitiesModule,
    PlacesModule,
    PromotionsModule,
    RoutesModule,
  ],
})
export class AppModule {}
