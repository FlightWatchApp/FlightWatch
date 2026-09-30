import type { InputHTMLAttributes } from 'react';
import styles from './control.module.css';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
  suffix?: string;
}

export function TextInput({ invalid, mono, suffix, className, ...props }: TextInputProps) {
  const classes = [
    styles.control,
    invalid ? styles.invalid : '',
    mono ? styles.mono : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (suffix) {
    return (
      <div className={styles.suffixWrapper}>
        <input className={classes} {...props} />
        <span className={styles.suffix}>{suffix}</span>
      </div>
    );
  }

  return <input className={classes} {...props} />;
}
