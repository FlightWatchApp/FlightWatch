/** Tabela de erros do SPEC-001 §8. */
export const CREATE_WATCH_ERROR_CODES = {
  INVALID_WATCH_INPUT: { status: 400, code: 'INVALID_WATCH_INPUT' },
  UNAUTHENTICATED: { status: 401, code: 'UNAUTHENTICATED' },
  CHANNEL_NOT_VERIFIED: { status: 403, code: 'CHANNEL_NOT_VERIFIED' },
  WATCH_LIMIT_REACHED: { status: 409, code: 'WATCH_LIMIT_REACHED' },
  IDEMPOTENCY_CONFLICT: { status: 409, code: 'IDEMPOTENCY_CONFLICT' },
  UNSUPPORTED_SEARCH: { status: 422, code: 'UNSUPPORTED_SEARCH' },
  RATE_LIMITED: { status: 429, code: 'RATE_LIMITED' },
  WATCH_CREATION_FAILED: { status: 500, code: 'WATCH_CREATION_FAILED' },
} as const;

export type CreateWatchErrorCode = keyof typeof CREATE_WATCH_ERROR_CODES;

export class CreateWatchError extends Error {
  readonly errorCode: CreateWatchErrorCode;
  readonly status: number;

  constructor(errorCode: CreateWatchErrorCode, message: string) {
    super(message);
    this.name = 'CreateWatchError';
    this.errorCode = errorCode;
    this.status = CREATE_WATCH_ERROR_CODES[errorCode].status;
  }
}
