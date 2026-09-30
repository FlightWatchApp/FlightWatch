import { IconArrowDownRight } from '@/components/ui/icon';
import { StatusTag } from '@/components/ui/status-tag';
import type { Deal } from '@/lib/api/types';
import { DEAL_TYPE_LABEL } from '@/lib/domain/deal';

export interface DealBadgeProps {
  deal: Deal;
}

/**
 * UX doc (03-visual-and-ux-direction.md): "classificação explicada, não
 * apenas 'promoção'" — o badge mostra só o tipo; `deal.explanation` (texto
 * pronto do backend) é sempre renderizado ao lado pelo componente pai, nunca
 * omitido.
 */
export function DealBadge({ deal }: DealBadgeProps) {
  return (
    <StatusTag
      tone="positive"
      icon={<IconArrowDownRight size={14} />}
      label={DEAL_TYPE_LABEL[deal.dealType]}
    />
  );
}
