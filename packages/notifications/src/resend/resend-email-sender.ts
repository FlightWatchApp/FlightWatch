import { createHash } from 'node:crypto';
import { EmailDeliveryError, type EmailDeliveryErrorClass } from '../email/errors.js';
import type { EmailMessage, EmailSender, EmailSendResult } from '../email/port.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
/** Limite do Resend para o header Idempotency-Key. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export interface ResendEmailSenderOptions {
  apiKey: string;
  /** "Flight Watch <avisos@avisos.flightwatch.com.br>". */
  from: string;
  timeoutMs: number;
  /** Injetável nos testes; padrão é o `fetch` nativo. */
  fetchFn?: typeof fetch;
}

/**
 * SPEC-035 — e-mail real pelo Resend atrás da porta `EmailSender`. A
 * idempotência da porta (SPEC-012) vai no header `Idempotency-Key`: a mesma
 * chave em 24 h devolve o envio já feito, sem mandar de novo.
 *
 * Nenhum erro carrega a chave da API nem o destinatário (CLAUDE.md §11.1).
 */
export class ResendEmailSender implements EmailSender {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ResendEmailSenderOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    let response: Response;
    try {
      response = await this.fetchFn(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey(message.idempotencyKey),
        },
        body: JSON.stringify({
          from: this.options.from,
          to: message.to,
          subject: message.subject,
          text: message.textBody,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      // Timeout ou falha de rede: transitório (a mesma chave evita envio duplo).
      throw new EmailDeliveryError('TIMEOUT', 'resend: request failed or timed out');
    }

    const body = (await response.json().catch(() => ({}))) as { id?: unknown; name?: unknown };
    if (response.ok) {
      if (typeof body.id === 'string' && body.id.length > 0) {
        return { providerMessageId: body.id };
      }
      throw new EmailDeliveryError('TEMPORARY_UNAVAILABLE', 'resend: 2xx without email id');
    }

    const name = typeof body.name === 'string' ? body.name : 'unknown';
    // Só status e nome do erro: a mensagem do Resend pode citar o destinatário.
    throw new EmailDeliveryError(
      classify(response.status, name),
      `resend: ${response.status} ${name}`,
    );
  }
}

/** Erro do Resend → classe da porta (tabela da SPEC-035). */
function classify(status: number, name: string): EmailDeliveryErrorClass {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 409) {
    return name === 'concurrent_idempotent_requests' ? 'TEMPORARY_UNAVAILABLE' : 'REJECTED';
  }
  if (status === 401 || status === 403) return 'PROVIDER_CONFIGURATION';
  if (status >= 500) return 'TEMPORARY_UNAVAILABLE';
  return 'REJECTED';
}

function idempotencyKey(key: string): string {
  return key.length <= MAX_IDEMPOTENCY_KEY_LENGTH
    ? key
    : createHash('sha256').update(key).digest('hex');
}
