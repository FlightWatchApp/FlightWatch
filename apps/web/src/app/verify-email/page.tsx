import Link from 'next/link';
import buttonStyles from '@/components/ui/button.module.css';
import { Card } from '@/components/ui/card';
import { IconCheckCircle, IconXCircle } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { ApiError } from '@/lib/api/client';
import { verifyEmail } from '@/lib/api/auth';
import styles from './page.module.css';

const primaryButton = [
  buttonStyles.button,
  buttonStyles.primary,
  buttonStyles.md,
  buttonStyles.fullWidth,
].join(' ');

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_VERIFICATION_TOKEN: 'Este link de confirmação não é válido. Peça um novo na sua conta.',
  VERIFICATION_TOKEN_EXPIRED: 'Este link de confirmação expirou. Peça um novo na sua conta.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let error: string | null = null;
  if (!token) {
    error = 'Link de confirmação incompleto — falta o token.';
  } else {
    try {
      await verifyEmail(token);
    } catch (caught) {
      error =
        caught instanceof ApiError
          ? (ERROR_MESSAGES[caught.code ?? ''] ?? 'Não foi possível confirmar seu e-mail.')
          : 'Não foi possível confirmar seu e-mail.';
    }
  }

  return (
    <div className={`container ${styles.page}`}>
      <Card>
        {error ? (
          <div className={styles.result}>
            <IconXCircle size={40} className={styles.errorIcon} />
            <h1>Não foi possível confirmar</h1>
            <InlineAlert tone="danger">{error}</InlineAlert>
          </div>
        ) : (
          <div className={styles.result}>
            <IconCheckCircle size={40} className={styles.successIcon} />
            <h1>E-mail confirmado</h1>
            <p className={styles.subtitle}>
              Sua conta já pode criar monitoramentos e receber alertas de preço.
            </p>
          </div>
        )}
        <Link href="/" className={primaryButton}>
          Ir para o início
        </Link>
      </Card>
    </div>
  );
}
