import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { OpportunitiesModule } from './opportunities/opportunities.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SearchesModule } from './searches/searches.module.js';
import { WatchesModule } from './watches/watches.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ObservabilityModule,
    AuthModule,
    WatchesModule,
    SearchesModule,
    OpportunitiesModule,
  ],
})
export class AppModule {}
