'use client';

import { useState, useTransition } from 'react';
import { resendVerificationAction } from '@/app/verify-email/actions';
import { InlineAlert } from '@/components/ui/inline-alert';
import styles from './email-verification-banner.module.css';

/** SPEC-010: só é renderizado quando `notificationChannelVerified` é `false` — ver app/page.tsx. */
export function EmailVerificationBanner() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleResend(): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await resendVerificationAction();
        if (result.success) {
          setSent(true);
        } else {
          setError(result.error ?? 'Não foi possível reenviar o e-mail agora.');
        }
      })();
    });
  }

  return (
    <InlineAlert tone="warning" title="Confirme seu e-mail">
      <p>
        Você precisa confirmar seu e-mail antes de criar um monitoramento. Verifique sua caixa de
        entrada.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <button
        type="button"
        className={styles.resendLink}
        onClick={handleResend}
        disabled={isPending || sent}
      >
        {sent ? 'E-mail reenviado' : isPending ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
      </button>
    </InlineAlert>
  );
}
