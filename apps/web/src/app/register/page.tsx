'use client';

import Link from 'next/link';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { registerAction } from './actions';
import styles from './page.module.css';

// SPEC-007 §5: placeholder, política de senha ainda não definida pelo produto.
const PASSWORD_MIN_LENGTH = 10;

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError('Informe seu email.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFormError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setFormError('As senhas não coincidem.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await registerAction({
          email,
          password,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (!result.success) {
          setFormError(result.error ?? 'Não foi possível criar sua conta.');
        }
      })();
    });
  }

  return (
    <div className={`container ${styles.page}`}>
      <div>
        <h1>Criar conta</h1>
        <p className={styles.subtitle}>
          Cadastre-se para monitorar preços de voos e receber alertas por email.
        </p>
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

          <FormField label="Senha" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} required>
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

          <FormField label="Confirmar senha" required>
            {(field) => (
              <TextInput
                id={field.id}
                aria-describedby={field.describedBy}
                invalid={field.invalid}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            )}
          </FormField>

          {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

          <div className={styles.actions}>
            <Button type="submit" disabled={isPending} fullWidth>
              {isPending ? 'Criando conta…' : 'Criar conta'}
            </Button>
          </div>
        </form>
      </Card>

      <p className={styles.altAction}>
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </div>
  );
}
