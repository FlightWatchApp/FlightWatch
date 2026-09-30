'use client';

import { useState, useTransition } from 'react';
import {
  cancelWatchAction,
  pauseWatchAction,
  reactivateWatchAction,
  type WatchLifecycleActionResult,
} from '@/app/watches/actions';
import { Button } from '@/components/ui/button';
import { IconPause, IconPlay, IconXCircle } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import type { WatchStatus } from '@/lib/api/types';
import styles from './watch-lifecycle-actions.module.css';

export interface WatchLifecycleActionsProps {
  watchId: string;
  status: WatchStatus;
}

/** SPEC-008: só ACTIVE e PAUSED têm ação disponível — os demais são estados terminais. */
export function WatchLifecycleActions({ watchId, status }: WatchLifecycleActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== 'ACTIVE' && status !== 'PAUSED') {
    return null;
  }

  function run(action: (id: string) => Promise<WatchLifecycleActionResult>): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await action(watchId);
        if (!result.success) {
          setError(result.error ?? 'Não foi possível concluir a ação.');
        }
      })();
    });
  }

  function handleCancel(): void {
    if (!window.confirm('Encerrar este monitoramento? Essa ação não pode ser desfeita.')) {
      return;
    }
    run(cancelWatchAction);
  }

  return (
    <div className={styles.actions}>
      {error && (
        <InlineAlert tone="danger">
          <p>{error}</p>
        </InlineAlert>
      )}
      <div className={styles.buttons}>
        {status === 'ACTIVE' && (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<IconPause size={14} />}
            disabled={isPending}
            onClick={() => run(pauseWatchAction)}
          >
            Pausar
          </Button>
        )}
        {status === 'PAUSED' && (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<IconPlay size={14} />}
            disabled={isPending}
            onClick={() => run(reactivateWatchAction)}
          >
            Reativar
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          leadingIcon={<IconXCircle size={14} />}
          disabled={isPending}
          onClick={handleCancel}
        >
          Encerrar
        </Button>
      </div>
    </div>
  );
}
