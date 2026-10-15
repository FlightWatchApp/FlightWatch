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
import { loginAction } from './actions';
import styles from './page.module.css';

/** SPEC-041: `siteKey` do Turnstile vem do servidor; null = captcha desligado. */
export function LoginForm({ siteKey }: { siteKey: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // O token vale uma vez: trocar a key recomeça o widget depois de cada tentativa.
  const [captchaKey, setCaptchaKey] = useState(0);
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

    if (siteKey && !captchaToken) {
      setFormError('Confirme que você não é um robô.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await loginAction({
          captchaToken: captchaToken ?? undefined,
          email,
          password,
        });
        if (!result.success) {
          setCaptchaToken(null);
          setCaptchaKey((key) => key + 1);
          setFormError(result.error ?? 'Não foi possível entrar.');
        }
      })();
    });
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse seus monitoramentos e promoções."
      footer={
        <>
          Ainda não tem conta? <Link href="/register">Criar conta</Link>
        </>
      }
    >
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

          {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptchaToken} />}

          <Button
            type="submit"
            disabled={isPending || (siteKey !== null && !captchaToken)}
            fullWidth
          >
            {isPending ? 'Entrando…' : 'Entrar'}
          </Button>

          <Link href="/forgot-password">Esqueci minha senha</Link>
        </form>
      </Card>
    </AuthShell>
  );
}
