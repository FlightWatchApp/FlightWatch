export type ProviderErrorClass =
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'AUTHENTICATION'
  | 'INVALID_QUERY'
  | 'MALFORMED_RESPONSE'
  | 'CANCELLED';

// SPEC-003 §6: só rate limit, timeout e indisponibilidade (5xx) são retentáveis.
const RETRYABLE_CLASSES = new Set<ProviderErrorClass>(['RATE_LIMITED', 'TIMEOUT', 'UNAVAILABLE']);

export class ProviderError extends Error {
  readonly errorClass: ProviderErrorClass;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    errorClass: ProviderErrorClass,
    message: string,
    options?: { retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'ProviderError';
    this.errorClass = errorClass;
    this.retryable = RETRYABLE_CLASSES.has(errorClass);
    if (options?.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
  }
}
