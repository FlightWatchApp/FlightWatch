import type { ReactNode } from 'react';
import styles from './status-tag.module.css';

export type StatusTone = 'positive' | 'informative' | 'attention' | 'critical' | 'neutral';

export interface StatusTagProps {
  tone: StatusTone;
  label: string;
  icon?: ReactNode;
}

/** Nunca comunica estado só por cor: sempre ícone + rótulo textual. */
export function StatusTag({ tone, label, icon }: StatusTagProps) {
  return (
    <span className={`${styles.tag} ${styles[tone]}`}>
      {icon}
      {label}
    </span>
  );
}
