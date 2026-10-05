import { IconArrowDownRight, IconSparkle } from '@/components/ui/icon';
import type { Deal } from '@/lib/api/types';
import { DEAL_TYPE_LABEL } from '@/lib/domain/deal';
import styles from './deal-badge.module.css';

export interface DealBadgeProps {
  deal: Deal;
}

/**
 * CP-07: `HISTORICAL_LOW` é o selo mais forte (verde cheio, ícone de
 * brilho) — "menor preço que o sistema já viu". `PERCENTAGE_BELOW_REFERENCE`
 * é mais discreto (verde suave, seta para baixo). O rótulo nunca aparece
 * sozinho: `deal.explanation` (texto pronto do backend) fica sempre ao lado,
 * renderizado por quem usa este componente (`DealCard`).
 */
export function DealBadge({ deal }: DealBadgeProps) {
  const strong = deal.dealType === 'HISTORICAL_LOW';
  return (
    <span className={`${styles.badge} ${strong ? styles.strong : styles.soft}`}>
      {strong ? <IconSparkle size={14} /> : <IconArrowDownRight size={14} />}
      {DEAL_TYPE_LABEL[deal.dealType]}
    </span>
  );
}
