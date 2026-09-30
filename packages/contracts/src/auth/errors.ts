/** Tabela de erros do SPEC-007 §8. */
export const AUTH_ERROR_CODES = {
  INVALID_AUTH_INPUT: { status: 400, code: 'INVALID_AUTH_INPUT' },
  UNAUTHENTICATED: { status: 401, code: 'UNAUTHENTICATED' },
  INVALID_CREDENTIALS: { status: 401, code: 'INVALID_CREDENTIALS' },
  EMAIL_ALREADY_REGISTERED: { status: 409, code: 'EMAIL_ALREADY_REGISTERED' },
  ACCOUNT_LOCKED: { status: 423, code: 'ACCOUNT_LOCKED' },
  // Credenciais corretas, mas a conta não está ACTIVE (BLOCKED/DELETED/
  // PENDING_VERIFICATION) — distinto de ACCOUNT_LOCKED, que é bloqueio
  // temporário por tentativas malsucedidas, não um estado permanente da conta.
  ACCOUNT_NOT_ACTIVE: { status: 403, code: 'ACCOUNT_NOT_ACTIVE' },
  // SPEC-010 §9.
  INVALID_VERIFICATION_TOKEN: { status: 400, code: 'INVALID_VERIFICATION_TOKEN' },
  VERIFICATION_TOKEN_EXPIRED: { status: 400, code: 'VERIFICATION_TOKEN_EXPIRED' },
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_CODES;

export class AuthError extends Error {
  readonly errorCode: AuthErrorCode;
  readonly status: number;

  constructor(errorCode: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.errorCode = errorCode;
    this.status = AUTH_ERROR_CODES[errorCode].status;
  }
}
