import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { MeOverviewResponse, UpdateMeResponse, WatchListItem } from '@flight-watch/contracts';
import {
  countNotifiedAlertsForUser,
  countWatchesCreatedSince,
  findBiggestLowPriceDrop,
  findPlaceSummaries,
  findUserDestinations,
} from '@flight-watch/database';
import { monthWindow } from '@flight-watch/domain';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PlacesService } from '../places/places.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { WatchesService } from '../watches/watches.service.js';

/** Painéis: até 3 itens cada (SPEC-040). */
const PANEL_SIZE = 3;

function isBelowTypical(watch: WatchListItem): boolean {
  const threshold = watch.lowPrice?.thresholdAmountMinor ?? null;
  return watch.currentPrice !== null && threshold !== null
    ? watch.currentPrice.amountMinor <= threshold
    : false;
}

/**
 * SPEC-040 — o que o sistema sabe da pessoa, para os painéis da página da
 * oferta e da home logada. Só banco e cache de promoções; nunca a fonte.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly watches: WatchesService,
    private readonly promotions: PromotionsService,
    private readonly places: PlacesService,
    private readonly metrics: MetricsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async overview(userId: string): Promise<MeOverviewResponse> {
    const db = this.prisma.client;
    const [user, list, alertsSent, drop, destinations] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { homeCityCode: true, role: true, monthlyWatchLimit: true },
      }),
      // Limite por usuário é 20 ativos (WatchesService): 100 cobre ativos e pausados.
      this.watches.listWatches(userId, { limit: 100 }),
      countNotifiedAlertsForUser(db, userId),
      findBiggestLowPriceDrop(db, userId),
      findUserDestinations(db, userId),
    ]);

    const open = list.watches.filter(
      (watch) => watch.status === 'ACTIVE' || watch.status === 'PAUSED',
    );
    const active = open.filter((watch) => watch.status === 'ACTIVE');
    const ordered = [...open].sort((a, b) => {
      const below =
        Number(isBelowTypical(b) && b.status === 'ACTIVE') -
        Number(isBelowTypical(a) && a.status === 'ACTIVE');
      return below !== 0 ? below : b.createdAt.localeCompare(a.createdAt);
    });

    const homeCityCode = user.homeCityCode;
    const names = await findPlaceSummaries(db, [
      ...(homeCityCode ? [homeCityCode] : []),
      ...(drop ? [drop.originIata, drop.destinationIata] : []),
    ]);
    const nameOf = (code: string) => names.get(code)?.name ?? code;

    const destinationPromotions = await this.promotions.cachedForDestinations(
      [...(homeCityCode ? [homeCityCode] : []), ...this.config.PROMOTION_SHOWCASE_ORIGIN_CITIES],
      new Set(destinations),
      PANEL_SIZE,
    );

    // SPEC-043: cota do mês do calendário em America/Campo_Grande; admin não tem limite.
    const window = monthWindow(new Date());
    const used = await countWatchesCreatedSince(db, userId, window.start);

    const response: MeOverviewResponse = {
      watchQuota: {
        used,
        limit:
          user.role === 'ADMIN'
            ? null
            : (user.monthlyWatchLimit ?? this.config.MONTHLY_WATCH_LIMIT),
        resetsAt: window.resetsAt.toISOString(),
      },
      homeCity: homeCityCode ? { code: homeCityCode, name: nameOf(homeCityCode) } : null,
      activeCount: active.length,
      alertsSent,
      belowTypicalNow: active.filter(isBelowTypical).length,
      biggestDrop: drop
        ? {
            amountMinor: drop.amountMinor,
            percent: Math.floor((drop.amountMinor * 100) / drop.typicalAmountMinor),
            currency: drop.currency,
            origin: { code: drop.originIata, name: nameOf(drop.originIata) },
            destination: { code: drop.destinationIata, name: nameOf(drop.destinationIata) },
            departureDate: drop.departureDate,
          }
        : null,
      activeWatches: ordered.slice(0, PANEL_SIZE),
      watchCount: open.length,
      destinationPromotions,
    };
    this.metrics.meOverviewRequestsTotal.inc({ panels: String(panelCount(response)) });
    return response;
  }

  /**
   * SPEC-040: cidade de partida da conta. Aeroporto vira a cidade dele; só
   * cidade pesquisável do catálogo (SPEC-029).
   */
  async updateHomeCity(userId: string, code: string | null): Promise<UpdateMeResponse> {
    let homeCity: UpdateMeResponse['homeCity'] = null;
    if (code !== null) {
      const cityCode = await this.places.resolveCity(code);
      const city = cityCode ? (await this.places.searchableCities([cityCode])).get(cityCode) : null;
      if (!city) {
        throw new BadRequestException({ code: 'UNSUPPORTED_CITY', message: 'city not in catalog' });
      }
      homeCity = { code: city.code, name: city.name };
    }
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { homeCityCode: homeCity?.code ?? null },
    });
    return { homeCity };
  }
}

/** Quantos painéis a página vai mostrar (o de busca sempre aparece). */
function panelCount(overview: MeOverviewResponse): number {
  const hasWatches = overview.watchCount > 0;
  return 1 + (hasWatches ? 2 : 0) + (overview.destinationPromotions.length > 0 ? 1 : 0);
}
