'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { AuthShell } from '@/components/account/auth-shell';
import { Turnstile } from '@/components/account/turnstile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { parseInviteFragment } from '@/lib/domain/invite-link';
import { registerAction } from './actions';
import styles from './page.module.css';

// SPEC-007 §5: placeholder, política de senha ainda não definida pelo produto.
const PASSWORD_MIN_LENGTH = 10;

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readHash(): string {
  return window.location.hash;
}

/**
 * SPEC-041: `siteKey` do Turnstile vem do servidor; null = captcha desligado.
 * SPEC-043: `inviteRequired` mostra o campo da chave de acesso.
 */
export function RegisterForm({
  siteKey,
  inviteRequired,
}: {
  siteKey: string | null;
  inviteRequired: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // O token vale uma vez: trocar a key recomeça o widget depois de cada tentativa.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // SPEC-043: o link do e-mail traz a chave e o e-mail no fragmento (#), que o
  // navegador não envia ao servidor. Preenche os campos uma vez e limpa a barra
  // de endereço (a chave não fica no histórico nem em captura de tela).
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => '');
  const fragment = parseInviteFragment(hash);
  const [seeded, setSeeded] = useState(false);
  if (fragment && !seeded) {
    setSeeded(true);
    setInviteCode(fragment.code);
    if (fragment.email) setEmail(fragment.email);
  }
  useEffect(() => {
    if (fragment) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [fragment]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError('Informe seu email.');
      return;
    }
    if (inviteRequired && !inviteCode.trim()) {
      setFormError('Informe a chave de acesso que você recebeu por e-mail.');
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

    if (siteKey && !captchaToken) {
      setFormError('Confirme que você não é um robô.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await registerAction({
          captchaToken: captchaToken ?? undefined,
          ...(inviteRequired ? { inviteCode } : {}),
          email,
          password,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (!result.success) {
          setCaptchaToken(null);
          setCaptchaKey((key) => key + 1);
          setFormError(result.error ?? 'Não foi possível criar sua conta.');
        }
      })();
    });
  }

  return (
    <AuthShell
      title={inviteRequired ? 'Criar conta' : 'Criar conta grátis'}
      subtitle="Monitore rotas e receba um e-mail quando o preço ficar bem abaixo do normal."
      footer={
        <>
          Já tem conta? <Link href="/login">Entrar</Link>
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

          {inviteRequired && (
            <FormField
              label="Chave de acesso"
              hint="Enviada por e-mail quando o acesso foi liberado. Pode digitar com ou sem hífen."
              required
            >
              {(field) => (
                <TextInput
                  id={field.id}
                  aria-describedby={field.describedBy}
                  invalid={field.invalid}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                />
              )}
            </FormField>
          )}

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

          <p className={styles.consent}>
            Ao criar a conta, você concorda com os <Link href="/termos">Termos de Uso</Link> e a{' '}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </p>

          {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptchaToken} />}

          <Button
            type="submit"
            disabled={isPending || (siteKey !== null && !captchaToken)}
            fullWidth
          >
            {isPending ? 'Criando conta…' : 'Criar conta'}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
