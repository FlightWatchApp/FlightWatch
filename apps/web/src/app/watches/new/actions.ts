'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { type CreateWatchInput, createWatch } from '@/lib/api/watches';

export interface CreateWatchActionResult {
  success: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_SEARCH: 'Essa rota, moeda ou mercado ainda não é suportado nesta versão.',
  WATCH_LIMIT_REACHED: 'Limite de monitoramentos do seu plano foi atingido.',
  CHANNEL_NOT_VERIFIED: 'Seu canal de notificação ainda não foi verificado.',
  INVALID_WATCH_INPUT: 'Alguns dados não são válidos — confira rota, datas e preço-alvo.',
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
    await createWatch({ ...input, notificationChannelId: user.notificationChannelId });
    return { success: true };
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
