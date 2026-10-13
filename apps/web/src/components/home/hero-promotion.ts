import type { PromotionHighlight, PromotionItem } from '@flight-watch/contracts';
import { listPromotionHighlights, listPromotions } from '@/lib/api/promotions';
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

export interface HomePromotions {
  /** A de maior score, com os preços por data para o gráfico. */
  hero: HeroPromotion;
  /** As seguintes (sem repetir a do cartão), para a seção "Promoções agora". */
  more: PromotionItem[];
}

/** Quantas promoções a home pede: a do cartão e até 3 na seção. */
const HOME_PROMOTION_LIMIT = 4;

/** Preços por data da referência mais a própria data da promoção, em ordem. */
function chartDays(promotion: PromotionItem): PriceChartDay[] {
  const days = promotion.reference.days.filter((day) => day.date !== promotion.departureDate);
  days.push({ date: promotion.departureDate, amountMinor: promotion.price.amountMinor });
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * SPEC-032: as melhores promoções saindo da origem que a pessoa escolheu, numa
 * única chamada (o gráfico usa os preços que a própria API devolve — a home
 * gasta 1 requisição do limite por IP, não 4). Sem origem, ou com qualquer
 * falha, devolve null: o cartão volta a ser o exemplo rotulado e a página
 * inicial nunca quebra por causa disso.
 */
export async function loadHomePromotions(origin: string | null): Promise<HomePromotions | null> {
  if (!origin) return null;
  let feed;
  try {
    feed = await listPromotions({ origin, sort: 'score', limit: HOME_PROMOTION_LIMIT });
  } catch {
    return null;
  }
  const [promotion, ...more] = feed.promotions;
  if (feed.status !== 'OK' || !promotion) return null;
  return { hero: heroFrom(feed.origin, feed.originName, promotion), more };
}

/** Cartão do topo para uma promoção (de uma origem escolhida ou da vitrine). */
export function heroFrom(
  origin: string,
  originName: string,
  promotion: PromotionItem,
): HeroPromotion {
  return {
    origin,
    originName,
    promotion,
    days: chartDays(promotion),
    renderedAt: new Date().toISOString(),
    routeHref: routePagesEnabled()
      ? routePath(
          { code: origin, name: originName },
          { code: promotion.destination, name: promotion.destinationName },
        )
      : null,
  };
}

/** Quantas promoções a vitrine pede (o cartão do topo pode usar a primeira). */
const SHOWCASE_LIMIT = 9;

/**
 * SPEC-034: vitrine das cidades mais usadas do Brasil, cada promoção com a
 * sua origem. Qualquer falha devolve []: a página inicial nunca quebra.
 */
export async function loadShowcase(): Promise<PromotionHighlight[]> {
  try {
    const response = await listPromotionHighlights(SHOWCASE_LIMIT);
    return response.status === 'OK' ? response.promotions : [];
  } catch {
    return [];
  }
}
