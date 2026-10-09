import type { RoutePriceStatus } from '@flight-watch/contracts';
import { chartMoney, shortDate } from './price-chart';

/**
 * SPEC-033: textos e regras de apresentação da página da rota. Todo fato diz
 * de onde vem (EVAL-ROUTE-001): distância é calculada, tempo é estimado.
 */

export function formatDistanceKm(km: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(km)} km`;
}

export function formatEstimatedDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const text =
    hours === 0
      ? `${rest} min`
      : rest === 0
        ? `${hours} h`
        : `${hours} h ${String(rest).padStart(2, '0')}`;
  return `cerca de ${text} (estimado)`;
}

export interface RouteDay {
  date: string;
  amountMinor: number;
  stops: number;
  observedAt: string;
}

/** Datas mais baratas: menor preço primeiro; no empate, a data mais cedo. */
export function cheapestDates<T extends RouteDay>(days: readonly T[], limit: number): T[] {
  return [...days]
    .sort((a, b) => a.amountMinor - b.amountMinor || (a.date < b.date ? -1 : 1))
    .slice(0, limit);
}

/** Título sem preço: o Google guarda o título por dias e o preço muda. */
export function routeTitle(originName: string, destinationName: string): string {
  return `Passagens de ${originName} para ${destinationName}`;
}

export function routeMetaDescription(
  originName: string,
  destinationName: string,
  cheapest: { amountMinor: number; currency: string; date: string; observedAt: string } | null,
): string {
  if (!cheapest) {
    return `Rota de ${originName} para ${destinationName} no mapa, com distância e aeroportos. Monitore para saber quando aparecer preço.`;
  }
  const seen = shortDate(cheapest.observedAt.slice(0, 10));
  return `Menor preço encontrado de ${originName} para ${destinationName}: ${chartMoney(cheapest.amountMinor, cheapest.currency)} em ${shortDate(cheapest.date)}, visto em ${seen}. Compare as datas, veja no mapa e monitore.`;
}

/** Página sem nenhum preço não vai para o Google (SPEC-033 §Indexação). */
export function routeIndexable(dayCount: number): boolean {
  return dayCount > 0;
}

/** Aviso do bloco de preço; null quando há preço completo. */
export function routePriceNotice(status: RoutePriceStatus): string | null {
  switch (status) {
    case 'NO_PRICES':
      return 'Ainda não encontramos preços para esta rota nos próximos meses. Veja todos os voos no site parceiro ou monitore para ser avisado.';
    case 'UPDATING':
      return 'Preços em atualização: alguns meses ainda não foram consultados. Volte em algumas horas.';
    case 'UNAVAILABLE':
      return 'Não foi possível consultar os preços agora. Isso não significa que a rota não tenha voos.';
    default:
      return null;
  }
}
