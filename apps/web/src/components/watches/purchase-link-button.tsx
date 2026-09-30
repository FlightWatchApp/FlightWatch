'use client';

import { recordPurchaseClickAction } from '@/app/watches/actions';
import buttonStyles from '@/components/ui/button.module.css';
import { IconExternalLink } from '@/components/ui/icon';
import type { CurrentOffer } from '@/lib/api/types';

export interface PurchaseLinkButtonProps {
  watchId: string;
  currentOffer: CurrentOffer;
  size?: 'sm' | 'md';
}

/**
 * SPEC-018 AC-010: rótulo muda por status, mas o link em si nunca some para
 * uma oferta EXPIRED — só CURRENT vs EXPIRED trocam de texto, ausência de
 * currentOffer é decidida pelo chamador (não renderiza este componente).
 */
export function PurchaseLinkButton({
  watchId,
  currentOffer,
  size = 'md',
}: PurchaseLinkButtonProps) {
  const label = currentOffer.status === 'CURRENT' ? 'Comprar passagem' : 'Atualizar preço';
  const classes = [buttonStyles.button, buttonStyles.primary, buttonStyles[size]].join(' ');

  return (
    <a
      href={currentOffer.purchaseUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      // Best-effort: não bloqueia nem desfaz a navegação se a chamada falhar
      // (SPEC-018 §"Modos de falha e retries").
      onClick={() => {
        void recordPurchaseClickAction(watchId);
      }}
    >
      {label}
      <IconExternalLink size={14} />
    </a>
  );
}
