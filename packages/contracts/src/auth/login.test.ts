import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from './login.js';

const validPayload = {
  email: 'pessoa@example.com',
  password: 'whatever-the-user-typed',
};

describe('loginRequestSchema', () => {
  it('accepts a valid payload', () => {
    expect(loginRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = loginRequestSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('trims and lowercases the email', () => {
    const result = loginRequestSchema.safeParse({
      ...validPayload,
      email: '  Pessoa@Example.com  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('pessoa@example.com');
    }
  });

  it('rejects an empty password', () => {
    const result = loginRequestSchema.safeParse({ ...validPayload, password: '' });
    expect(result.success).toBe(false);
  });

  it('does not enforce the registration minimum length on login', () => {
    const result = loginRequestSchema.safeParse({ ...validPayload, password: 'short' });
    expect(result.success).toBe(true);
  });
});
