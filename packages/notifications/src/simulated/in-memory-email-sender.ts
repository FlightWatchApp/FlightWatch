import { EmailDeliveryError, type EmailDeliveryErrorClass } from '../email/errors.js';
import type { EmailMessage, EmailSendResult, EmailSender } from '../email/port.js';

export type EmailSendBehavior = (message: EmailMessage) => EmailSendResult;

function defaultSendBehavior(message: EmailMessage): EmailSendResult {
  return { providerMessageId: `sim-${message.idempotencyKey}` };
}

export function failingSendBehavior(
  errorClass: EmailDeliveryErrorClass,
  reason: string,
): EmailSendBehavior {
  return () => {
    throw new EmailDeliveryError(errorClass, reason);
  };
}

/** Fake em memória — registra o que "enviou" para asserção em teste, sem rede. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  private readonly resultsByIdempotencyKey = new Map<string, EmailSendResult>();

  constructor(private readonly behavior: EmailSendBehavior = defaultSendBehavior) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    // SPEC-012 §3: contrato da porta exige idempotência por idempotencyKey —
    // uma segunda chamada com a mesma chave nunca gera um segundo "envio" real,
    // devolve o resultado já conhecido. Só sucesso é cacheado: uma falha
    // anterior não garante que o provedor tenha memorizado a chave, então uma
    // nova tentativa deve realmente tentar de novo.
    const cached = this.resultsByIdempotencyKey.get(message.idempotencyKey);
    if (cached) {
      return cached;
    }
    const result = this.behavior(message);
    this.sent.push(message);
    this.resultsByIdempotencyKey.set(message.idempotencyKey, result);
    return result;
  }
}
