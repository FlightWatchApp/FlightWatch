import type { WatchQuota } from '@flight-watch/contracts';

const QUOTA_TIME_ZONE = 'America/Campo_Grande';

/** "3 de 5 neste mês"; `null` quando não há limite (admin). */
export function quotaLabel(quota: WatchQuota): string | null {
  return quota.limit === null ? null : `${quota.used} de ${quota.limit} neste mês`;
}

/** "1º de novembro", sempre no fuso da cota (a API manda o instante em UTC). */
function resetDayLabel(resetsAt: string): string {
  const month = new Intl.DateTimeFormat('pt-BR', {
    timeZone: QUOTA_TIME_ZONE,
    month: 'long',
  }).format(new Date(resetsAt));
  return `1º de ${month}`;
}

/** Texto do erro `WATCH_MONTHLY_LIMIT_REACHED` (SPEC-043); `details` vem da API. */
export function monthlyLimitMessage(details: Record<string, unknown> | undefined): string {
  const limit = details?.limit;
  const resetsAt = details?.resetsAt;
  if (typeof limit !== 'number' || typeof resetsAt !== 'string') {
    return 'Você chegou ao limite de monitoramentos deste mês. Novos ficam liberados no mês que vem.';
  }
  const created = limit === 1 ? 'o 1 monitoramento' : `os ${limit} monitoramentos`;
  return `Você já criou ${created} deste mês. Novos ficam liberados em ${resetDayLabel(resetsAt)}.`;
}
