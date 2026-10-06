'use client';

import Link from 'next/link';
import { type FormEvent, useState, useTransition } from 'react';
import { AuthShell } from '@/components/account/auth-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { forgotPasswordAction } from './actions';
import styles from './page.module.css';

/** SPEC-026: pedido de redefinição de senha. */
export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError('Informe seu email.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await forgotPasswordAction({ email });
        if (result.success) {
          setSent(true);
        } else {
          setFormError(result.error ?? 'Não foi possível enviar agora.');
        }
      })();
    });
  }

  return (
    <AuthShell
      title="Esqueci minha senha"
      subtitle="Enviamos um link para você definir uma nova senha."
      footer={
        <>
          Lembrou a senha? <Link href="/login">Entrar</Link>
        </>
      }
    >
      <Card>
        {sent ? (
          <InlineAlert tone="success" title="Confira seu email">
            Se existir uma conta com esse email, enviamos um link para redefinir a senha. Ele vale
            por 1 hora.
          </InlineAlert>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <FormField label="Email da conta" required>
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

            {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

            <Button type="submit" disabled={isPending} fullWidth>
              {isPending ? 'Enviando…' : 'Enviar link'}
            </Button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
