'use client';

import { recordPurchaseClickAction } from '@/app/watches/actions';
import buttonStyles from '@/components/ui/button.module.css';
import { IconExternalLink } from '@/components/ui/icon';
import styles from './purchase-button.module.css';

export interface PurchaseButtonProps {
  /** Já validada pela API: allowlist de SPEC-018 + rastreio de afiliado de SPEC-020. */
  href: string;
  status: 'CURRENT' | 'EXPIRED';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  /** Presente só quando o CTA nasce de um Watch (SPEC-018 §"Registrar clique"). */
  watchId?: string;
  /** Contexto lido por leitor de tela antes de "abre o site parceiro em nova aba", ex.: "GRU para MIA por R$ 1.083,91". */
  context?: string;
  /** Sobre fundo petróleo (card de destaque): preenchimento petróleo do
   * botão primário ficaria quase invisível sobre o próprio fundo. */
  inverse?: boolean;
  /** SPEC-031: rótulo próprio (ex.: "Ver todos os voos"); padrão "Comprar passagem". */
  label?: string;
}

/**
 * SPEC-020: único componente que pode renderizar um link de compra — sempre
 * `<a>` real para o site parceiro, nova aba, `rel="noopener noreferrer
 * sponsored"`. Oferta expirada continua clicável (rótulo muda), nunca some.
 */
export function PurchaseButton({
  href,
  status,
  size = 'md',
  fullWidth = false,
  watchId,
  context,
  inverse = false,
  label: customLabel,
}: PurchaseButtonProps) {
  const current = status === 'CURRENT';
  const classes = [
    buttonStyles.button,
    current ? buttonStyles.primary : buttonStyles.secondary,
    inverse && current ? styles.inverseCurrent : '',
    buttonStyles[size],
    fullWidth ? buttonStyles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = customLabel ?? (current ? 'Comprar passagem' : 'Atualizar preço');

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={classes}
      onClick={() => {
        if (watchId) {
          // Best-effort (SPEC-018 §"Modos de falha"): não bloqueia nem desfaz a navegação.
          void recordPurchaseClickAction(watchId);
        }
      }}
    >
      {label}
      <IconExternalLink size={size === 'sm' ? 14 : 16} />
      <span className="visually-hidden">
        {context ? `, ${context}` : ''} (abre o site parceiro em nova aba)
      </span>
    </a>
  );
}
