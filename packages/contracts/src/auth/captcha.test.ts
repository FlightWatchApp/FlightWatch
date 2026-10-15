import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from './login.js';
import { passwordResetRequestSchema } from './password-reset.js';
import { registerRequestSchema } from './register.js';

// SPEC-041: o token é opcional no contrato; quem exige é a API, com o captcha ligado.
describe('captchaToken nos pedidos de conta', () => {
  const base = { email: 'pessoa@example.com' };

  it('aceita com e sem token', () => {
    expect(loginRequestSchema.safeParse({ ...base, password: 'x' }).success).toBe(true);
    expect(
      loginRequestSchema.safeParse({ ...base, password: 'x', captchaToken: 'tok' }).success,
    ).toBe(true);
    expect(passwordResetRequestSchema.safeParse({ ...base, captchaToken: 'tok' }).success).toBe(
      true,
    );
    expect(
      registerRequestSchema.safeParse({
        ...base,
        password: 'a-very-long-password-123',
        timezone: 'America/Sao_Paulo',
        captchaToken: 'tok',
      }).success,
    ).toBe(true);
  });

  it('recusa token vazio ou grande demais', () => {
    expect(loginRequestSchema.safeParse({ ...base, password: 'x', captchaToken: '' }).success).toBe(
      false,
    );
    expect(
      loginRequestSchema.safeParse({ ...base, password: 'x', captchaToken: 'a'.repeat(2049) })
        .success,
    ).toBe(false);
  });
});
