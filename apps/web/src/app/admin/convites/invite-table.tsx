'use client';

import { useState, useTransition } from 'react';
import type { InviteState, InviteView } from '@flight-watch/contracts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { IconInfo } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { resendInviteAction, revokeInviteAction } from '../actions';
import { InviteCodeBox } from './invite-code-box';
import styles from '../admin.module.css';

const STATE_LABEL: Record<InviteState, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: 'Disponível', tone: 'informative' },
  REDEEMED: { label: 'Usada', tone: 'positive' },
  EXPIRED: { label: 'Vencida', tone: 'attention' },
  REVOKED: { label: 'Revogada', tone: 'neutral' },
};

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Campo_Grande',
});

function when(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function InviteTable({ items }: { items: InviteView[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<InviteView | null>(null);
  const [issued, setIssued] = useState<{ email: string; code: string; emailSent: boolean } | null>(
    null,
  );

  function resend(invite: InviteView): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await resendInviteAction(invite.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setIssued({
          email: result.created.invite.email,
          code: result.created.code,
          emailSent: result.created.emailSent,
        });
      })();
    });
  }

  function revoke(invite: InviteView): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await revokeInviteAction(invite.id);
        if (!result.ok) setError(result.error);
        setRevoking(null);
      })();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconInfo size={24} />}
        title="Nenhuma chave por aqui"
        description="Gere a primeira acima, depois de conferir o pagamento."
      />
    );
  }

  return (
    <>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {issued && <InviteCodeBox {...issued} onClose={() => setIssued(null)} />}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Chaves de convite</caption>
          <thead>
            <tr>
              <th scope="col">E-mail</th>
              <th scope="col">Estado</th>
              <th scope="col">Criada</th>
              <th scope="col">Vence</th>
              <th scope="col">Usada em</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((invite) => {
              const state = STATE_LABEL[invite.state];
              return (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td>
                    <StatusTag tone={state.tone} label={state.label} />
                  </td>
                  <td>{when(invite.createdAt)}</td>
                  <td>{when(invite.expiresAt)}</td>
                  <td>{when(invite.redeemedAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      {invite.state !== 'REDEEMED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() => resend(invite)}
                        >
                          Gerar nova
                        </Button>
                      )}
                      {invite.state === 'AVAILABLE' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => setRevoking(invite)}
                        >
                          Revogar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={revoking !== null}
        title="Revogar chave?"
        description={`A chave enviada para ${revoking?.email ?? ''} deixa de funcionar. Você pode gerar outra depois.`}
        confirmLabel="Revogar"
        tone="danger"
        isConfirming={isPending}
        onConfirm={() => revoking && revoke(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}
