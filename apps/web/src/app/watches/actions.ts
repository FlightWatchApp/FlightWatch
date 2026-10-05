'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api/client';
import { cancelWatch, pauseWatch, reactivateWatch, recordPurchaseClick } from '@/lib/api/watches';

export interface WatchLifecycleActionResult {
  success: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  WATCH_NOT_FOUND: 'Este monitoramento não existe mais.',
  INVALID_WATCH_TRANSITION: 'Esse monitoramento já mudou de estado — atualize a página.',
};

function toResult(error: unknown): WatchLifecycleActionResult {
  if (error instanceof ApiError) {
    return {
      success: false,
      error: ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível concluir a ação.',
    };
  }
  return { success: false, error: 'Não foi possível concluir a ação.' };
}

/**
 * Os mesmos botões aparecem na lista de `/watches` e em `/watches/:id` — as
 * duas rotas são invalidadas para que a mudança de status apareça imediatamente
 * onde o monitoramento estiver sendo exibido.
 */
function revalidateWatchRoutes(watchId: string): void {
  revalidatePath('/');
  revalidatePath('/watches');
  revalidatePath(`/watches/${watchId}`);
}

export async function pauseWatchAction(watchId: string): Promise<WatchLifecycleActionResult> {
  try {
    await pauseWatch(watchId);
    revalidateWatchRoutes(watchId);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function reactivateWatchAction(watchId: string): Promise<WatchLifecycleActionResult> {
  try {
    await reactivateWatch(watchId);
    revalidateWatchRoutes(watchId);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelWatchAction(watchId: string): Promise<WatchLifecycleActionResult> {
  try {
    await cancelWatch(watchId);
    revalidateWatchRoutes(watchId);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * SPEC-018 §"Modos de falha e retries": best-effort — nunca deve impedir o
 * link externo de abrir, então engole qualquer erro em vez de propagar.
 */
export async function recordPurchaseClickAction(watchId: string): Promise<void> {
  try {
    await recordPurchaseClick(watchId);
  } catch {
    // telemetria, não efeito de domínio — falha aqui não é visível ao usuário.
  }
}
