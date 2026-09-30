export interface EmailMessage {
  to: string;
  subject: string;
  textBody: string;
  idempotencyKey: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

/**
 * Porta do canal de e-mail — mesmo espírito do FlightProvider (ADR-004): um
 * provedor real entra atrás disso sem mudar o resto.
 *
 * SPEC-012 §3: toda implementação DEVE ser idempotente por `idempotencyKey`
 * — uma segunda chamada de `send()` com a mesma chave nunca deve produzir um
 * segundo envio real; deve devolver o resultado já conhecido daquela chave
 * (ou um resultado equivalente). Isso é o que torna seguro reenviar uma
 * entrega presa em `SENDING` sem saber se o envio original de fato saiu —
 * ver `reconcileStaleSendingNotificationDeliveries`. Um provedor real
 * (SES/Resend/Postmark/etc.) normalmente já oferece isso via um header ou
 * parâmetro de idempotência nativo do próprio provedor.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
