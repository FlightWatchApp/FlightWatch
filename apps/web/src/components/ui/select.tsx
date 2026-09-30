import type { SelectHTMLAttributes } from 'react';
import { IconChevronDown } from './icon';
import styles from './control.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...props }: SelectProps) {
  const classes = [styles.control, invalid ? styles.invalid : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.selectWrapper}>
      <select className={classes} {...props}>
        {children}
      </select>
      <IconChevronDown size={18} className={styles.selectChevron} />
    </div>
  );
}
