import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SimulatedFlightProvider } from '@flight-watch/providers';
import { AuthModule } from '../auth/auth.module.js';
import { WatchesModule } from '../watches/watches.module.js';
import { FLIGHT_PROVIDER } from './flight-provider.token.js';
import { OffersController } from './offers.controller.js';
import { SearchesController } from './searches.controller.js';
import { SearchesService } from './searches.service.js';

// SPEC-014 §"Segurança e privacidade": CLAUDE.md §10.3 já documentava estas
// duas variáveis como PROPOSTO — esta é a primeira feature a consumi-las de
// verdade. Lidas direto de process.env (mesmo padrão de PORT/METRICS_PORT em
// main.ts) — não existe packages/config neste repositório ainda.
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 10);

@Module({
  imports: [
    AuthModule,
    WatchesModule,
    ThrottlerModule.forRoot([
      { name: 'default', ttl: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMIT_MAX },
    ]),
  ],
  controllers: [SearchesController, OffersController],
  providers: [
    SearchesService,
    { provide: FLIGHT_PROVIDER, useValue: new SimulatedFlightProvider() },
  ],
})
export class SearchesModule {}
