import Link from 'next/link';
import { AuthShell } from '@/components/account/auth-shell';
import { Card } from '@/components/ui/card';
import { InlineAlert } from '@/components/ui/inline-alert';

/** SPEC-027: confirmação depois da exclusão; a sessão já foi encerrada. */
export default function AccountDeletedPage() {
  return (
    <AuthShell
      title="Conta excluída"
      subtitle="Obrigado por ter usado o Flight Watch."
      footer={<Link href="/">Voltar ao início</Link>}
    >
      <Card>
        <InlineAlert tone="success">
          Sua conta foi excluída e seus monitoramentos foram encerrados. Você não vai mais receber
          alertas.
        </InlineAlert>
      </Card>
    </AuthShell>
  );
}
