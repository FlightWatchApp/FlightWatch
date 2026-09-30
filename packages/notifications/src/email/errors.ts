export type EmailDeliveryErrorClass =
  'TIMEOUT' | 'RATE_LIMITED' | 'TEMPORARY_UNAVAILABLE' | 'PERMANENT_BOUNCE';

// SPEC-006 §7: só timeout/rate-limit/indisponibilidade temporária são retentáveis.
const RETRYABLE_CLASSES = new Set<EmailDeliveryErrorClass>([
  'TIMEOUT',
  'RATE_LIMITED',
  'TEMPORARY_UNAVAILABLE',
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
