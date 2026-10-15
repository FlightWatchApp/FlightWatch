'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import {
  getWatch,
  type CreateWatchInput,
  createWatch,
  previewWatch,
  type WatchPreviewInput,
} from '@/lib/api/watches';
import type { WatchPreviewResponse } from '@flight-watch/contracts';
import type { WatchDetail } from '@/lib/api/types';
import { revalidatePath } from 'next/cache';

export interface CreateWatchActionResult {
  success: boolean;
  watch?: WatchDetail;
  watchId?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_SEARCH: 'Essa rota, moeda ou mercado ainda não é suportado nesta versão.',
  WATCH_LIMIT_REACHED: 'Limite de monitoramentos do seu plano foi atingido.',
  CHANNEL_NOT_VERIFIED: 'Seu canal de notificação ainda não foi verificado.',
  INVALID_WATCH_INPUT: 'Alguns dados não são válidos — confira a rota e as datas.',
};

export async function createWatchAction(
  input: Omit<CreateWatchInput, 'notificationChannelId'>,
): Promise<CreateWatchActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!user.notificationChannelId) {
    return { success: false, error: 'Seu canal de notificação ainda não foi verificado.' };
  }

  try {
    const created = await createWatch({
      ...input,
      notificationChannelId: user.notificationChannelId,
    });
    revalidatePath('/');
    revalidatePath('/watches');

    try {
      return { success: true, watchId: created.id, watch: await getWatch(created.id) };
    } catch {
      return { success: true, watchId: created.id };
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error:
          ERROR_MESSAGES[error.code ?? ''] ??
          'Não foi possível criar o monitoramento. Tente novamente.',
      };
    }
    return { success: false, error: 'Não foi possível criar o monitoramento. Tente novamente.' };
  }
}

/**
 * SPEC-039: prévia da viagem antes de criar (preço normal, menor já observado,
 * preço de hoje e datas próximas). Falha vira `null`: a tela segue sem prévia,
 * e criar o monitoramento continua possível.
 */
export async function previewWatchAction(
  input: WatchPreviewInput,
): Promise<WatchPreviewResponse | null> {
  try {
    return await previewWatch(input);
  } catch {
    return null;
  }
}
