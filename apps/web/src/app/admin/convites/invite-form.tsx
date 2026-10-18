'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TextInput } from '@/components/ui/text-input';
import { createInviteAction } from '../actions';
import { InviteCodeBox } from './invite-code-box';
import styles from '../admin.module.css';

export function InviteForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [ttlDays, setTtlDays] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; code: string; emailSent: boolean } | null>(
    null,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Informe o e-mail da pessoa.');
      return;
    }
    const days = ttlDays.trim() ? Number(ttlDays) : undefined;
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) {
      setError('A validade deve ser de 1 a 90 dias.');
      return;
    }
    startTransition(() => {
      void (async () => {
        const result = await createInviteAction(email.trim(), days);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setIssued({
          email: result.created.invite.email,
          code: result.created.code,
          emailSent: result.created.emailSent,
        });
        setEmail('');
      })();
    });
  }

  return (
    <section className={styles.section} aria-labelledby="invite-new">
      <h2 id="invite-new" className={styles.sectionTitle}>
        Gerar chave
      </h2>
      <p className={styles.muted}>
        Depois de conferir o pagamento. A pessoa recebe a chave por e-mail e só consegue criar a
        conta com o mesmo e-mail.
      </p>
      <form className={styles.inline} onSubmit={handleSubmit} noValidate>
        <FormField label="E-mail da pessoa" required>
          {(field) => (
            <TextInput
              id={field.id}
              aria-describedby={field.describedBy}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Validade (dias)" hint="Padrão do sistema se vazio.">
          {(field) => (
            <TextInput
              id={field.id}
              aria-describedby={field.describedBy}
              className={styles.limitInput}
              inputMode="numeric"
              value={ttlDays}
              onChange={(event) => setTtlDays(event.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" loading={isPending}>
          Gerar chave
        </Button>
      </form>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {issued && <InviteCodeBox {...issued} onClose={() => setIssued(null)} />}
    </section>
  );
}
