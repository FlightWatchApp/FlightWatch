import type { ReactNode } from 'react';
import { IconAlertTriangle, IconCheckCircle, IconInfo, IconXCircle } from './icon';
import styles from './inline-alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface InlineAlertProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
}

const ICONS: Record<AlertTone, ReactNode> = {
  info: <IconInfo size={20} />,
  success: <IconCheckCircle size={20} />,
  warning: <IconAlertTriangle size={20} />,
  danger: <IconXCircle size={20} />,
};

export function InlineAlert({ tone, title, children }: InlineAlertProps) {
  const isUrgent = tone === 'warning' || tone === 'danger';
  return (
    <div
      className={`${styles.alert} ${styles[tone]}`}
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
    >
      <span className={styles.icon}>{ICONS[tone]}</span>
      <div>
        {title && <p className={styles.title}>{title}</p>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
