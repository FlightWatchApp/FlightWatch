import { describe, expect, it } from 'vitest';
import { authenticatedUserSchema, authSessionResponseSchema } from './session.js';

const validUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'pessoa@example.com',
  status: 'ACTIVE' as const,
  role: 'USER' as const,
  notificationChannelId: '22222222-2222-2222-2222-222222222222',
  notificationChannelVerified: false,
  homeCity: null,
};

describe('authenticatedUserSchema', () => {
  it('accepts a valid user with a notification channel', () => {
    expect(authenticatedUserSchema.safeParse(validUser).success).toBe(true);
  });

  it('accepts a null notificationChannelId', () => {
    const result = authenticatedUserSchema.safeParse({ ...validUser, notificationChannelId: null });
    expect(result.success).toBe(true);
  });

  // SPEC-043: o web mostra o link "Admin" só para ADMIN.
  it('accepts ADMIN and rejects an unknown role', () => {
    expect(authenticatedUserSchema.safeParse({ ...validUser, role: 'ADMIN' }).success).toBe(true);
    expect(authenticatedUserSchema.safeParse({ ...validUser, role: 'ROOT' }).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = authenticatedUserSchema.safeParse({ ...validUser, status: 'NOT_A_STATUS' });
    expect(result.success).toBe(false);
  });

  // SPEC-010: sem isso o frontend não sabe se deve mostrar o aviso de confirmação.
  it('rejects a payload missing notificationChannelVerified', () => {
    const withoutField: Record<string, unknown> = { ...validUser };
    delete withoutField.notificationChannelVerified;
    const result = authenticatedUserSchema.safeParse(withoutField);
    expect(result.success).toBe(false);
  });

  // SPEC-040: cidade de partida da conta.
  it('accepts a home city', () => {
    const result = authenticatedUserSchema.safeParse({
      ...validUser,
      homeCity: { code: 'SAO', name: 'São Paulo' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts notificationChannelVerified true', () => {
    const result = authenticatedUserSchema.safeParse({
      ...validUser,
      notificationChannelVerified: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('authSessionResponseSchema', () => {
  it('accepts a full session response', () => {
    const result = authSessionResponseSchema.safeParse({
      token: 'opaque-token',
      expiresAt: '2026-10-20T00:00:00.000Z',
      user: validUser,
    });
    expect(result.success).toBe(true);
  });
});
