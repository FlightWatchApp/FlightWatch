import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from './password-reset-email-template.js';

describe('renderPasswordResetEmail (SPEC-026)', () => {
  const email = renderPasswordResetEmail({
    resetUrl: 'https://flightwatch.example/reset-password?token=abc',
    expiresInMinutes: 60,
  });

  it('inclui o link de redefinição', () => {
    expect(email.textBody).toContain('https://flightwatch.example/reset-password?token=abc');
  });

  it('informa validade, uso único e encerramento das sessões', () => {
    expect(email.textBody).toContain('60 minutos');
    expect(email.textBody).toContain('uma vez');
    expect(email.textBody).toContain('sessões abertas');
  });

  it('orienta quem não pediu a ignorar', () => {
    expect(email.textBody).toContain('Se você não pediu isso');
    expect(email.subject).toBe('Redefinir sua senha — Flight Watch');
  });
});
