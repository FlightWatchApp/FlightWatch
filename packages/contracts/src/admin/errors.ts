/** SPEC-043: erros das rotas de admin (não admin recebe 404, sem corpo próprio). */
export const ADMIN_ERROR_CODES = {
  INVALID_ADMIN_INPUT: { status: 400, code: 'INVALID_ADMIN_INPUT' },
  NOT_FOUND: { status: 404, code: 'NOT_FOUND' },
  INVITE_EMAIL_TAKEN: { status: 409, code: 'INVITE_EMAIL_TAKEN' },
  INVITE_NOT_REVOCABLE: { status: 409, code: 'INVITE_NOT_REVOCABLE' },
  RATE_LIMITED: { status: 429, code: 'RATE_LIMITED' },
} as const;

export type AdminErrorCode = keyof typeof ADMIN_ERROR_CODES;

export class AdminError extends Error {
  readonly errorCode: AdminErrorCode;
  readonly status: number;

  constructor(errorCode: AdminErrorCode, message: string) {
    super(message);
    this.name = 'AdminError';
    this.errorCode = errorCode;
    this.status = ADMIN_ERROR_CODES[errorCode].status;
  }
}
