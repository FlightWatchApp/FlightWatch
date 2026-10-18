import { monthlyLimitMessage } from '@/lib/domain/watch-quota';
import type { ApiError } from './client';

/**
 * SPEC-043: mensagens dos erros de criação de monitoramento que dependem de
 * dados da resposta (cota mensal) ou valem em toda tela (acesso suspenso).
 * `undefined` = o chamador usa a própria tabela.
 */
export function describeWatchCreateError(error: ApiError): string | undefined {
  if (error.code === 'WATCH_MONTHLY_LIMIT_REACHED') {
    return monthlyLimitMessage(error.details);
  }
  if (error.code === 'ACCESS_SUSPENDED') {
    return 'Seu acesso está suspenso. Fale com a gente em contato@flightwatch.com.br.';
  }
  return undefined;
}
