export type EmailDeliveryErrorClass =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'TEMPORARY_UNAVAILABLE'
  | 'PERMANENT_BOUNCE'
  // SPEC-035: o provedor recusou por configuração nossa (chave, domínio não
  // verificado, modo de teste) — não é culpa do destinatário.
  | 'PROVIDER_CONFIGURATION'
  // SPEC-035: o provedor recusou o pedido em si; repetir não resolve.
  | 'REJECTED';

// SPEC-006 §7: só timeout/rate-limit/indisponibilidade temporária são retentáveis.
// SPEC-035: erro de configuração também retenta — dá tempo de corrigir sem perder o alerta.
const RETRYABLE_CLASSES = new Set<EmailDeliveryErrorClass>([
  'TIMEOUT',
  'RATE_LIMITED',
  'TEMPORARY_UNAVAILABLE',
  'PROVIDER_CONFIGURATION',
]);

export class EmailDeliveryError extends Error {
  readonly errorClass: EmailDeliveryErrorClass;
  readonly retryable: boolean;

  constructor(errorClass: EmailDeliveryErrorClass, message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.errorClass = errorClass;
    this.retryable = RETRYABLE_CLASSES.has(errorClass);
  }
}
