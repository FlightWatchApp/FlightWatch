import { createHash } from 'node:crypto';
import { EmailDeliveryError, type EmailDeliveryErrorClass } from '../email/errors.js';
import type { EmailMessage, EmailSendResult, EmailSender } from '../email/port.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
/** Limite da Resend para o header Idempotency-Key. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export interface ResendEmailSenderOptions {
  apiKey: string;
  /** Remetente verificado no domínio, ex.: `Flight Watch <alertas@dominio.com.br>`. */
  from: string;
  timeoutMs?: number;
  /** Injetável para testes. */
  fetch?: typeof fetch;
}

/**
 * HTTP → taxonomia de SPEC-006 §7 (tabela da SPEC-036). 429, 5xx e 409 com a
 * mesma chave ainda em curso são retentáveis. 401/403 é configuração nossa
 * (chave, domínio não verificado, modo de teste): também retenta, para não
 * perder o alerta enquanto alguém corrige — não é culpa do destinatário.
 * 400/422 e 409 com outro corpo: repetir não resolve.
 */
function classifyStatus(status: number, name: string): EmailDeliveryErrorClass {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 409) {
    return name === 'invalid_idempotent_request' ? 'REJECTED' : 'TEMPORARY_UNAVAILABLE';
  }
  if (status >= 500) return 'TEMPORARY_UNAVAILABLE';
  if (status === 401 || status === 403) return 'PROVIDER_CONFIGURATION';
  return 'REJECTED';
}

function idempotencyKey(key: string): string {
  return key.length <= MAX_IDEMPOTENCY_KEY_LENGTH
    ? key
    : createHash('sha256').update(key).digest('hex');
}

/**
 * Adapter da Resend atrás da porta `EmailSender`. A `Idempotency-Key` nativa da
 * Resend cumpre SPEC-012 §3: reenviar a mesma entrega não gera segundo e-mail.
 * Mensagens de erro carregam só o status HTTP — nunca chave, destinatário ou
 * corpo da resposta (CLAUDE.md §11.1).
 */
export function createResendEmailSender(options: ResendEmailSenderOptions): EmailSender {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      let response: Response;
      try {
        response = await doFetch(RESEND_EMAILS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey(message.idempotencyKey),
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.textBody,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'AbortError' || name === 'TimeoutError') {
          throw new EmailDeliveryError('TIMEOUT', `resend request timed out after ${timeoutMs}ms`);
        }
        throw new EmailDeliveryError('TEMPORARY_UNAVAILABLE', 'resend request failed');
      }

      if (!response.ok) {
        // Só o nome do erro da Resend (enumerado); a mensagem pode citar o destinatário.
        const errorBody = (await response.json().catch(() => null)) as { name?: unknown } | null;
        const name = typeof errorBody?.name === 'string' ? errorBody.name : 'unknown';
        throw new EmailDeliveryError(
          classifyStatus(response.status, name),
          `resend responded with status ${response.status} (${name})`,
        );
      }

      const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
      if (!body || typeof body.id !== 'string' || body.id.length === 0) {
        // 2xx sem id: o envio pode ter saído; repetir é seguro por causa da
        // chave de idempotência.
        throw new EmailDeliveryError('TEMPORARY_UNAVAILABLE', 'resend response without message id');
      }
      return { providerMessageId: body.id };
    },
  };
}
