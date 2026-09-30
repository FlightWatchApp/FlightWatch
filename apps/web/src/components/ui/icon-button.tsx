import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './icon-button.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  'aria-label': string;
  tone?: 'default' | 'danger';
}

/** Botão só de ícone — sempre exige aria-label porque não há texto visível para nomeá-lo. */
export function IconButton({ icon, tone = 'default', className, ...props }: IconButtonProps) {
  const classes = [styles.button, tone === 'danger' ? styles.danger : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...props}>
      {icon}
    </button>
  );
}
