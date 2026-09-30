'use client';

import Link from 'next/link';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { loginAction } from './actions';
import styles from './page.module.css';

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError('Informe seu email.');
      return;
    }
    if (!password) {
      setFormError('Informe sua senha.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await loginAction({ email, password });
        if (!result.success) {
          setFormError(result.error ?? 'Não foi possível entrar.');
        }
      })();
    });
  }

  return (
    <div className={`container ${styles.page}`}>
      <div>
        <h1>Entrar</h1>
        <p className={styles.subtitle}>Acesse seus monitoramentos de preço.</p>
      </div>

      <Card>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <FormField label="Email" required>
            {(field) => (
              <TextInput
                id={field.id}
                aria-describedby={field.describedBy}
                invalid={field.invalid}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>

          <FormField label="Senha" required>
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

          <div className={styles.actions}>
            <Button type="submit" disabled={isPending} fullWidth>
              {isPending ? 'Entrando…' : 'Entrar'}
            </Button>
          </div>
        </form>
      </Card>

      <p className={styles.altAction}>
        Ainda não tem conta? <Link href="/register">Criar conta</Link>
      </p>
    </div>
  );
}
