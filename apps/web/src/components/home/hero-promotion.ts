import { PROMOTION_CURRENCY, PROMOTION_MARKET, type PromotionItem } from '@flight-watch/contracts';
import { listPromotions } from '@/lib/api/promotions';
import { getPriceCalendar } from '@/lib/api/searches';
import { tripLengthDays } from '@/lib/domain/price-calendar';
import type { PriceChartDay } from '@/lib/domain/price-chart';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import { routePath } from '@/lib/domain/route-url';

/** Promoção real do cartão da página inicial, com os preços por data da rota. */
export interface HeroPromotion {
  origin: string;
  originName: string;
  promotion: PromotionItem;
  /** Menor preço por data nos meses da referência (SPEC-031); vazio se o calendário falhar. */
  days: PriceChartDay[];
  /** Instante da renderização no servidor: a idade não muda na hidratação. */
  renderedAt: string;
  /** Página da rota (SPEC-033); null com a página desligada. */
  routeHref: string | null;
}

/**
 * SPEC-032: a melhor promoção (maior score) saindo da origem que a pessoa
 * escolheu. Sem origem, ou com qualquer falha, devolve null e o cartão volta
 * a ser o exemplo rotulado — a página inicial nunca quebra por causa dele.
 */
export async function loadHeroPromotion(origin: string | null): Promise<HeroPromotion | null> {
  if (!origin) return null;
  let feed;
  try {
    feed = await listPromotions({ origin, sort: 'score', limit: 1 });
  } catch {
    return null;
  }
  const promotion = feed.promotions[0];
  if (feed.status !== 'OK' || !promotion) return null;

  // O gráfico usa a mesma janela da referência (mês da data e vizinhos),
  // para mostrar exatamente os preços que formaram a mediana. Os meses vêm
  // do cache por rota-mês do motor (SPEC-032): normalmente sem chamada nova.
  const months = promotion.reference.months.length
    ? promotion.reference.months
    : [promotion.departureDate.slice(0, 7)];
  const calendars = await Promise.allSettled(
    months.map((month) =>
      getPriceCalendar({
        origin: feed.origin,
        destination: promotion.destination,
        month,
        tripType: promotion.tripType,
        tripLengthDays: tripLengthDays(promotion.departureDate, promotion.returnDate),
        currency: PROMOTION_CURRENCY,
        market: PROMOTION_MARKET,
      }),
    ),
  );
  // Mês que falhou só fica de fora; sem nenhum, o cartão mostra a promoção sem gráfico.
  const days: PriceChartDay[] = calendars.flatMap((result) =>
    result.status === 'fulfilled'
      ? result.value.days.map((day) => ({ date: day.date, amountMinor: day.amountMinor }))
      : [],
  );

  return {
    origin: feed.origin,
    originName: feed.originName,
    promotion,
    days,
    renderedAt: new Date().toISOString(),
    routeHref: routePagesEnabled()
      ? routePath(
          { code: feed.origin, name: feed.originName },
          { code: promotion.destination, name: promotion.destinationName },
        )
      : null,
  };
}
