import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from './register.js';

const validPayload = {
  email: 'pessoa@example.com',
  password: '1234567890',
  timezone: 'America/Campo_Grande',
};

describe('registerRequestSchema', () => {
  it('accepts a valid payload', () => {
    expect(registerRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = registerRequestSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('trims and lowercases the email', () => {
    const result = registerRequestSchema.safeParse({
      ...validPayload,
      email: '  Pessoa@Example.com  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('pessoa@example.com');
    }
  });

  it('rejects a malformed email', () => {
    const result = registerRequestSchema.safeParse({ ...validPayload, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than the minimum', () => {
    const result = registerRequestSchema.safeParse({ ...validPayload, password: '123456789' });
    expect(result.success).toBe(false);
  });

  it('accepts a password at exactly the minimum length', () => {
    const result = registerRequestSchema.safeParse({ ...validPayload, password: '1234567890' });
    expect(result.success).toBe(true);
  });

  it('rejects a password longer than the maximum', () => {
    const result = registerRequestSchema.safeParse({ ...validPayload, password: 'a'.repeat(257) });
    expect(result.success).toBe(false);
  });

  it('rejects an empty timezone', () => {
    const result = registerRequestSchema.safeParse({ ...validPayload, timezone: '' });
    expect(result.success).toBe(false);
  });
});
