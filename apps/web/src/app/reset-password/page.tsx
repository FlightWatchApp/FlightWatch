import Link from 'next/link';
import { AuthShell } from '@/components/account/auth-shell';
import { Card } from '@/components/ui/card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { ResetPasswordForm } from './reset-password-form';

/**
 * SPEC-026: destino do link enviado por email. O token só é validado ao
 * enviar a nova senha — abrir a página não consome o link (scanners de email
 * costumam pré-carregar links).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Definir nova senha"
      subtitle="Escolha uma senha que você não usa em outros sites."
      footer={
        <>
          Link expirado? <Link href="/forgot-password">Pedir um novo</Link>
        </>
      }
    >
      <Card>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <InlineAlert tone="danger">
            Link incompleto: falta o código de redefinição. Abra o link do email de novo ou peça um
            novo.
          </InlineAlert>
        )}
      </Card>
    </AuthShell>
  );
}
