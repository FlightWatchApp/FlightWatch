'use client';

import Link from 'next/link';
import { type FormEvent, useState, useTransition } from 'react';
import { AuthShell } from '@/components/account/auth-shell';
import { Turnstile } from '@/components/account/turnstile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { forgotPasswordAction } from './actions';
import styles from './page.module.css';

/** SPEC-026: pedido de redefinição de senha. */
/** SPEC-041: `siteKey` do Turnstile vem do servidor; null = captcha desligado. */
export function ForgotPasswordForm({ siteKey }: { siteKey: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // O token vale uma vez: trocar a key recomeça o widget depois de cada tentativa.
  const [captchaKey, setCaptchaKey] = useState(0);
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

    if (siteKey && !captchaToken) {
      setFormError('Confirme que você não é um robô.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await forgotPasswordAction({
          captchaToken: captchaToken ?? undefined,
          email,
        });
        if (result.success) {
          setSent(true);
        } else {
          setCaptchaToken(null);
          setCaptchaKey((key) => key + 1);
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

            {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptchaToken} />}

            <Button
              type="submit"
              disabled={isPending || (siteKey !== null && !captchaToken)}
              fullWidth
            >
              {isPending ? 'Enviando…' : 'Enviar link'}
            </Button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
