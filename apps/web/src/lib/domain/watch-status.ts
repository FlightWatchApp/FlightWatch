import type { StatusTone } from '@/components/ui/status-tag';
import type { AlertEventStatus, SearchExecutionOutcome, WatchStatus } from '@/lib/api/types';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
  description: string;
}

/**
 * Rótulo, tom e explicação de cada status de Watch (DOMAIN.md §3.2). O texto
 * evita termos internos ("ACTIVE") e explica o que o usuário pode fazer a partir
 * daqui — só pausar/reativar/cancelar existem como transições reais do domínio.
 */
export const WATCH_STATUS_PRESENTATION: Record<WatchStatus, StatusPresentation> = {
  ACTIVE: {
    label: 'Monitorando',
    tone: 'informative',
    description: 'O sistema está consultando o preço desta viagem periodicamente.',
  },
  PAUSED: {
    label: 'Pausado',
    tone: 'neutral',
    description: 'Nenhuma nova consulta é feita até você reativar este monitoramento.',
  },
  COMPLETED: {
    label: 'Concluído',
    tone: 'positive',
    description: 'Este monitoramento chegou ao fim previsto e não é mais consultado.',
  },
  EXPIRED: {
    label: 'Expirado',
    tone: 'neutral',
    description: 'A data da viagem passou e o monitoramento foi encerrado automaticamente.',
  },
  CANCELLED: {
    label: 'Encerrado',
    tone: 'neutral',
    description:
      'Você encerrou este monitoramento. Ele fica no seu histórico, mas não é mais consultado.',
  },
};

export function isTerminalWatchStatus(status: WatchStatus): boolean {
  return status === 'COMPLETED' || status === 'EXPIRED' || status === 'CANCELLED';
}

export const SEARCH_EXECUTION_PRESENTATION: Record<
  SearchExecutionOutcome,
  { label: string; tone: StatusTone }
> = {
  succeeded: { label: 'Consulta concluída', tone: 'positive' },
  no_offers: { label: 'Sem oferta encontrada', tone: 'neutral' },
  retryable_failure: { label: 'Falha temporária do provedor', tone: 'attention' },
  permanent_failure: { label: 'Falha na consulta', tone: 'critical' },
  rate_limited: { label: 'Provedor limitou as consultas', tone: 'attention' },
};

export const ALERT_EVENT_PRESENTATION: Record<
  AlertEventStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: 'Avaliando', tone: 'neutral' },
  suppressed: { label: 'Suprimido (cooldown)', tone: 'neutral' },
  queued: { label: 'Enviando', tone: 'informative' },
  notified: { label: 'Notificado', tone: 'positive' },
  failed: { label: 'Falha no envio', tone: 'critical' },
};
