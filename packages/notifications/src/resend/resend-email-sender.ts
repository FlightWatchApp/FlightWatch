import { EmailDeliveryError, type EmailDeliveryErrorClass } from '../email/errors.js';
import type { EmailMessage, EmailSendResult, EmailSender } from '../email/port.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export interface ResendEmailSenderOptions {
  apiKey: string;
  /** Remetente verificado no domínio, ex.: `Flight Watch <alertas@dominio.com.br>`. */
  from: string;
  timeoutMs?: number;
  /** Injetável para testes. */
  fetch?: typeof fetch;
}

/**
 * HTTP → taxonomia de SPEC-006 §7. Só 429, 5xx e 409 (a Resend ainda processa a
 * mesma chave de idempotência) são retentáveis; o resto é erro nosso ou do
 * destinatário e repetir não resolve.
 */
function classifyStatus(status: number): EmailDeliveryErrorClass {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 409 || status >= 500) return 'TEMPORARY_UNAVAILABLE';
  return 'PERMANENT_BOUNCE';
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
            'Idempotency-Key': message.idempotencyKey,
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
        throw new EmailDeliveryError(
          classifyStatus(response.status),
          `resend responded with status ${response.status}`,
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
