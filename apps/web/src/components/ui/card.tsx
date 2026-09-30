import type { HTMLAttributes } from 'react';
import styles from './card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'default' | 'sm';
}

export function Card({ padding = 'default', className, ...props }: CardProps) {
  const classes = [styles.card, padding === 'sm' ? styles.padSm : '', className]
    .filter(Boolean)
    .join(' ');
  return <div className={classes} {...props} />;
}
