'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { createWatch } from '@/lib/api/watches';
import { getWatch } from '@/lib/api/watches';
import type { WatchDetail } from '@/lib/api/types';
import type { OpportunityItem } from '@/lib/api/types';

export interface MonitorOpportunityActionResult {
  success: boolean;
  watchId?: string;
  watch?: WatchDetail;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  CHANNEL_NOT_VERIFIED: 'Seu canal de notificação ainda não foi verificado.',
  WATCH_LIMIT_REACHED: 'Limite de monitoramentos do seu plano foi atingido.',
  INVALID_WATCH_INPUT: 'Alguns dados não são válidos.',
};

/**
 * SPEC-015 §"Contexto": diferente do SPEC-014 (`deriveWatchFromOffer`), uma
 * oportunidade já tem um `SearchTarget` existente com histórico — não há
 * nada novo pra semear. "Monitorar" aqui é só `POST /v1/watches` normal
 * (SPEC-001); `findOrCreateSearchTarget` vai achar, não criar, o target por
 * fingerprint.
 */
export type MonitorableOpportunity = Pick<
  OpportunityItem,
  'origin' | 'destination' | 'tripType' | 'market' | 'departureDate' | 'returnDate'
> & { currency: string };

export async function monitorOpportunityAction(
  opportunity: MonitorableOpportunity,
  targetAmountMinor: number,
): Promise<MonitorOpportunityActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!user.notificationChannelId) {
    return { success: false, error: 'Seu canal de notificação ainda não foi verificado.' };
  }

  try {
    const watch = await createWatch({
      origin: opportunity.origin,
      destination: opportunity.destination,
      tripType: opportunity.tripType,
      departureDate: opportunity.departureDate,
      returnDate: opportunity.returnDate,
      currency: opportunity.currency,
      market: opportunity.market,
      targetAmountMinor,
      notificationChannelId: user.notificationChannelId,
    });
    try {
      return { success: true, watchId: watch.id, watch: await getWatch(watch.id) };
    } catch {
      return { success: true, watchId: watch.id };
    }
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
