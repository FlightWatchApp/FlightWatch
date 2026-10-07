'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { deleteAccountAction } from './actions';
import styles from './page.module.css';

/** SPEC-027: confirmação por senha + confirmação explícita, ação irreversível. */
export function DeleteAccountForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!password) {
      setFormError('Informe sua senha para confirmar.');
      return;
    }
    if (
      !window.confirm(
        'Excluir sua conta? Seus monitoramentos serão encerrados e isso não pode ser desfeito.',
      )
    ) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await deleteAccountAction({ password });
        if (!result.success) {
          setFormError(result.error ?? 'Não foi possível excluir a conta agora.');
        }
      })();
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormField label="Senha atual" required>
        {(field) => (
          <TextInput
            id={field.id}
            aria-describedby={field.describedBy}
            invalid={field.invalid}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>

      {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

      <Button type="submit" variant="destructive" disabled={isPending} fullWidth>
        {isPending ? 'Excluindo…' : 'Excluir minha conta'}
      </Button>
    </form>
  );
}
