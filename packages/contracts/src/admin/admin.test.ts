import { describe, expect, it } from 'vitest';
import { AdminError, ADMIN_ERROR_CODES } from './errors.js';
import { createInviteRequestSchema, listInvitesQuerySchema } from './invites.js';
import { updateAdminUserRequestSchema } from './users.js';

describe('createInviteRequestSchema (SPEC-043)', () => {
  it('normaliza o e-mail como o cadastro e aceita validade de 1 a 90 dias', () => {
    const result = createInviteRequestSchema.safeParse({ email: ' Ana@Exemplo.com ', ttlDays: 7 });
    expect(result.success && result.data.email).toBe('ana@exemplo.com');
    expect(createInviteRequestSchema.safeParse({ email: 'a@b.com', ttlDays: 0 }).success).toBe(
      false,
    );
    expect(createInviteRequestSchema.safeParse({ email: 'a@b.com', ttlDays: 91 }).success).toBe(
      false,
    );
  });

  it('recusa campos desconhecidos', () => {
    expect(createInviteRequestSchema.safeParse({ email: 'a@b.com', code: 'x' }).success).toBe(
      false,
    );
  });
});

describe('listInvitesQuerySchema', () => {
  it('limite padrão de 25 e teto de 100', () => {
    const parsed = listInvitesQuerySchema.parse({});
    expect(parsed.limit).toBe(25);
    expect(listInvitesQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('updateAdminUserRequestSchema', () => {
  it('aceita null para voltar ao padrão e exige algum campo', () => {
    expect(updateAdminUserRequestSchema.safeParse({ monthlyWatchLimit: null }).success).toBe(true);
    expect(updateAdminUserRequestSchema.safeParse({ accessStatus: 'SUSPENDED' }).success).toBe(
      true,
    );
    expect(updateAdminUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAdminUserRequestSchema.safeParse({ monthlyWatchLimit: 0 }).success).toBe(false);
  });
});

describe('AdminError', () => {
  it.each(Object.keys(ADMIN_ERROR_CODES) as Array<keyof typeof ADMIN_ERROR_CODES>)(
    'resolve o status de %s',
    (code) => {
      expect(new AdminError(code, 'm').status).toBe(ADMIN_ERROR_CODES[code].status);
    },
  );
});
