/** Tabela de erros do SPEC-008 §8. */
export const WATCH_LIFECYCLE_ERROR_CODES = {
  INVALID_WATCH_ID: { status: 400, code: 'INVALID_WATCH_ID' },
  UNAUTHENTICATED: { status: 401, code: 'UNAUTHENTICATED' },
  WATCH_NOT_FOUND: { status: 404, code: 'WATCH_NOT_FOUND' },
  INVALID_WATCH_TRANSITION: { status: 409, code: 'INVALID_WATCH_TRANSITION' },
} as const;

export type WatchLifecycleErrorCode = keyof typeof WATCH_LIFECYCLE_ERROR_CODES;

export class WatchLifecycleError extends Error {
  readonly errorCode: WatchLifecycleErrorCode;
  readonly status: number;

  constructor(errorCode: WatchLifecycleErrorCode, message: string) {
    super(message);
    this.name = 'WatchLifecycleError';
    this.errorCode = errorCode;
    this.status = WATCH_LIFECYCLE_ERROR_CODES[errorCode].status;
  }
}

export type WatchLifecycleAction = 'pause' | 'reactivate' | 'cancel';
