import Link from 'next/link';
import buttonStyles from '@/components/ui/button.module.css';
import { IconChevronRight } from '@/components/ui/icon';
import purchaseStyles from '@/components/purchase/purchase-button.module.css';

export interface ViewOfferLinkProps {
  href: string;
  /** Lido pelo leitor de tela depois de "Ver oferta" (ex.: "São Paulo para Rio por R$ 404"). */
  context?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Sobre o fundo petróleo (mesmo padrão do `PurchaseButton`). */
  inverse?: boolean;
}

/**
 * SPEC-038: ação principal de todo cartão de passagem. Leva à página da
 * oferta (ou do monitoramento); a compra fica lá, junto da companhia e do
 * aviso de preço. Link interno: sem nova aba, sem `sponsored`.
 */
export function ViewOfferLink({ href, context, size = 'md', inverse = false }: ViewOfferLinkProps) {
  const classes = [
    buttonStyles.button,
    buttonStyles.primary,
    inverse ? purchaseStyles.inverseCurrent : '',
    buttonStyles[size],
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Link href={href} prefetch={false} className={classes} data-umami-event="ver-oferta">
      Ver oferta
      <IconChevronRight size={size === 'sm' ? 14 : 16} />
      {context && <span className="visually-hidden">, {context}</span>}
    </Link>
  );
}
