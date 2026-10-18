'use client';

import { type FormEvent, useState, useTransition } from 'react';
import type { AdminUserView } from '@flight-watch/contracts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { IconInfo } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { StatusTag } from '@/components/ui/status-tag';
import { TextInput } from '@/components/ui/text-input';
import { updateUserAction } from '../actions';
import styles from '../admin.module.css';

const date = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Campo_Grande',
});

export function PeopleTable({ items }: { items: AdminUserView[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminUserView | null>(null);

  function patch(user: AdminUserView, change: Parameters<typeof updateUserAction>[1]): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await updateUserAction(user.id, change);
        if (!result.ok) setError(result.error);
        setConfirming(null);
      })();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconInfo size={24} />}
        title="Ninguém por aqui"
        description="As pessoas aparecem depois que criam a conta."
      />
    );
  }

  return (
    <>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Pessoas com conta</caption>
          <thead>
            <tr>
              <th scope="col">E-mail</th>
              <th scope="col">Criada</th>
              <th scope="col">Cota do mês</th>
              <th scope="col">Ativos</th>
              <th scope="col">Acesso</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.email}
                  {user.role === 'ADMIN' && ' (admin)'}
                  {!user.emailVerified && ' · e-mail não confirmado'}
                </td>
                <td>{date.format(new Date(user.createdAt))}</td>
                <td className="tabular-nums">
                  {user.watchesCreatedThisMonth} de{' '}
                  {user.effectiveMonthlyLimit === null ? 'sem limite' : user.effectiveMonthlyLimit}
                </td>
                <td className="tabular-nums">{user.activeWatches}</td>
                <td>
                  {user.accessStatus === 'ACTIVE' ? (
                    <StatusTag tone="positive" label="Ativo" />
                  ) : (
                    <StatusTag tone="critical" label="Suspenso" />
                  )}
                </td>
                <td>
                  <div className={styles.actions}>
                    {user.role !== 'ADMIN' && (
                      <LimitForm user={user} disabled={isPending} onSave={patch} />
                    )}
                    {user.role !== 'ADMIN' &&
                      (user.accessStatus === 'ACTIVE' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => setConfirming(user)}
                        >
                          Suspender
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() => patch(user, { accessStatus: 'ACTIVE' })}
                        >
                          Reativar
                        </Button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title="Suspender o acesso?"
        description={`${confirming?.email ?? ''} é desconectada e todos os monitoramentos ativos são pausados. Reativar o acesso não retoma os monitoramentos sozinho.`}
        confirmLabel="Suspender"
        tone="danger"
        isConfirming={isPending}
        onConfirm={() => confirming && patch(confirming, { accessStatus: 'SUSPENDED' })}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

/** Cota própria da pessoa; vazio volta ao padrão do sistema. */
function LimitForm({
  user,
  disabled,
  onSave,
}: {
  user: AdminUserView;
  disabled: boolean;
  onSave: (user: AdminUserView, change: { monthlyWatchLimit: number | null }) => void;
}) {
  const [value, setValue] = useState(user.monthlyWatchLimit?.toString() ?? '');
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = value.trim() === '' ? null : Number(value);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(user, { monthlyWatchLimit: parsed });
  }

  return (
    <form className={styles.limitForm} onSubmit={submit} noValidate>
      <TextInput
        className={styles.limitInput}
        aria-label={`Cota mensal de ${user.email} (vazio = padrão)`}
        placeholder="padrão"
        inputMode="numeric"
        invalid={invalid}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={disabled}>
        Salvar cota
      </Button>
    </form>
  );
}
