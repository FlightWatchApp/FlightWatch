/** SPEC-014 §"Modos de falha e retries". */
export const SEARCH_ERROR_CODES = {
  INVALID_SEARCH_INPUT: { status: 400, code: 'INVALID_SEARCH_INPUT' },
  UNSUPPORTED_SEARCH: { status: 422, code: 'UNSUPPORTED_SEARCH' },
  RATE_LIMITED: { status: 429, code: 'RATE_LIMITED' },
  FLIGHT_SEARCH_NOT_FOUND: { status: 404, code: 'FLIGHT_SEARCH_NOT_FOUND' },
} as const;

export type SearchErrorCode = keyof typeof SEARCH_ERROR_CODES;

export class SearchError extends Error {
  readonly errorCode: SearchErrorCode;
  readonly status: number;

  constructor(errorCode: SearchErrorCode, message: string) {
    super(message);
    this.name = 'SearchError';
    this.errorCode = errorCode;
    this.status = SEARCH_ERROR_CODES[errorCode].status;
  }
}

/** SPEC-014 §"Comportamento de domínio": derivar Watch de uma oferta de busca. */
export const DERIVE_WATCH_ERROR_CODES = {
  OFFER_NOT_FOUND: { status: 404, code: 'OFFER_NOT_FOUND' },
  OFFER_EXPIRED: { status: 410, code: 'OFFER_EXPIRED' },
} as const;

export type DeriveWatchErrorCode = keyof typeof DERIVE_WATCH_ERROR_CODES;

export class DeriveWatchError extends Error {
  readonly errorCode: DeriveWatchErrorCode;
  readonly status: number;

  constructor(errorCode: DeriveWatchErrorCode, message: string) {
    super(message);
    this.name = 'DeriveWatchError';
    this.errorCode = errorCode;
    this.status = DERIVE_WATCH_ERROR_CODES[errorCode].status;
  }
}
