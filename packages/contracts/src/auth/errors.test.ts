import { describe, expect, it } from 'vitest';
import { AUTH_ERROR_CODES, AuthError } from './errors.js';

describe('AuthError', () => {
  it('carries the status mapped for its error code', () => {
    const error = new AuthError('EMAIL_ALREADY_REGISTERED', 'email already registered');
    expect(error.errorCode).toBe('EMAIL_ALREADY_REGISTERED');
    expect(error.status).toBe(AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED.status);
    expect(error.message).toBe('email already registered');
    expect(error.name).toBe('AuthError');
  });

  it.each(Object.keys(AUTH_ERROR_CODES) as Array<keyof typeof AUTH_ERROR_CODES>)(
    'resolves the correct status for %s',
    (code) => {
      const error = new AuthError(code, 'msg');
      expect(error.status).toBe(AUTH_ERROR_CODES[code].status);
    },
  );
});
