import { useId } from 'react';
import { IconInfo } from './icon';
import styles from './tooltip.module.css';

export interface TooltipProps {
  label: string;
}

/** Ícone de informação com dica acessível por hover e por foco de teclado. */
export function Tooltip({ label }: TooltipProps) {
  const id = useId();
  return (
    <span className={styles.wrapper}>
      <button type="button" className={styles.trigger} aria-describedby={id}>
        <IconInfo size={16} />
        <span className="visually-hidden">Mais informação</span>
      </button>
      <span role="tooltip" id={id} className={styles.bubble}>
        {label}
      </span>
    </span>
  );
}
