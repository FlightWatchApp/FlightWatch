import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Troca o ícone inicial por um spinner e marca `aria-busy`; o botão fica desabilitado. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
