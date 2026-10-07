'use client';

import Link from 'next/link';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { resetPasswordAction } from './actions';
import styles from './page.module.css';

const PASSWORD_MIN_LENGTH = 10;

export function ResetPasswordForm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setFormError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setFormError('As duas senhas não são iguais.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await resetPasswordAction({ token, password });
        if (result.success) {
          setDone(true);
        } else {
          setFormError(result.error ?? 'Não foi possível redefinir a senha.');
        }
      })();
    });
  }

  if (done) {
    return (
      <div className={styles.form}>
        <InlineAlert tone="success" title="Senha redefinida">
          Por segurança, encerramos todas as sessões abertas da sua conta. Entre com a nova senha.
        </InlineAlert>
        <Link href="/login">Ir para o login</Link>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormField label="Nova senha" hint="Mínimo de 10 caracteres." required>
        {(field) => (
          <TextInput
            id={field.id}
            aria-describedby={field.describedBy}
            invalid={field.invalid}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>

      <FormField label="Repita a nova senha" required>
        {(field) => (
          <TextInput
            id={field.id}
            aria-describedby={field.describedBy}
            invalid={field.invalid}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        )}
      </FormField>

      {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

      <Button type="submit" disabled={isPending} fullWidth>
        {isPending ? 'Salvando…' : 'Definir nova senha'}
      </Button>
    </form>
  );
}
