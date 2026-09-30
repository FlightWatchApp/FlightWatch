'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { deriveWatchFromOffer } from '@/lib/api/searches';

export interface DeriveWatchActionResult {
  success: boolean;
  watchId?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  OFFER_NOT_FOUND: 'Essa oferta não existe mais.',
  OFFER_EXPIRED: 'Essa oferta expirou — faça uma nova busca.',
  CHANNEL_NOT_VERIFIED: 'Seu canal de notificação ainda não foi verificado.',
  WATCH_LIMIT_REACHED: 'Limite de monitoramentos do seu plano foi atingido.',
  INVALID_WATCH_INPUT: 'Alguns dados não são válidos.',
};

/**
 * SPEC-014 §"Comportamento": "monitorar" exige confirmação explícita (o
 * clique + preencher o preço-alvo no modal já é essa confirmação) — abrir a
 * página de resultado nunca cria Watch sozinho.
 */
export async function deriveWatchAction(
  offerId: string,
  targetAmountMinor: number,
): Promise<DeriveWatchActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    // login/actions.ts sempre redireciona pra "/" no sucesso — não existe
    // suporte a "voltar pra onde eu estava" ainda, então não prometer isso
    // aqui com um `?next=`.
    redirect('/login');
  }
  if (!user.notificationChannelId) {
    return { success: false, error: 'Seu canal de notificação ainda não foi verificado.' };
  }

  try {
    const watch = await deriveWatchFromOffer(offerId, {
      targetAmountMinor,
      notificationChannelId: user.notificationChannelId,
    });
    return { success: true, watchId: watch.id };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível criar o monitoramento.',
      };
    }
    return { success: false, error: 'Não foi possível criar o monitoramento.' };
  }
}
