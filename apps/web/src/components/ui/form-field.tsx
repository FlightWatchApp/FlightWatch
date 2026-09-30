import { useId } from 'react';
import type { ReactNode } from 'react';
import { IconAlertTriangle } from './icon';
import styles from './form-field.module.css';

export interface FormFieldRenderProps {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (field: FormFieldRenderProps) => ReactNode;
}

/**
 * Gera os ids de label/hint/erro e os repassa via render prop — evita clonar o
 * controle filho (frágil com TypeScript) e garante que todo campo tenha label
 * associado e aria-describedby corretos.
 */
export function FormField({ label, hint, error, required, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {!required && <span className={styles.optional}>opcional</span>}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className={styles.error} id={errorId} role="alert">
          <IconAlertTriangle size={14} />
          {error}
        </span>
      )}
    </div>
  );
}
