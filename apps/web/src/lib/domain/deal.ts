import type { DealType } from '@/lib/api/types';

/**
 * SPEC-015 / UX doc: rótulo curto do badge — a explicação de verdade vem de
 * `deal.explanation` (montada no backend); este rótulo é só o "tipo",
 * nunca substitui o texto explicado.
 */
export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  HISTORICAL_LOW: 'Menor preço já visto',
  PERCENTAGE_BELOW_REFERENCE: 'Abaixo da média',
};
