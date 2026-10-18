import { describe, expect, it } from 'vitest';
import { renderInviteEmail } from './invite-email-template.js';

describe('renderInviteEmail (SPEC-043)', () => {
  const email = renderInviteEmail({
    registerUrl:
      'https://flightwatch.example/register#convite=K7QMX4XTP9HRC2WVAN6DJ3QEZ&email=a%40b.com',
    code: 'K7QMX-4XTP9-HRC2W-VAN6D-J3QEZ',
    validityDays: 30,
  });

  it('tem o assunto combinado', () => {
    expect(email.subject).toBe('Sua chave de acesso ao Flight Watch');
  });

  it('traz o link, a chave formatada e a validade', () => {
    expect(email.textBody).toContain('https://flightwatch.example/register#convite=');
    expect(email.textBody).toContain('K7QMX-4XTP9-HRC2W-VAN6D-J3QEZ');
    expect(email.textBody).toContain('30 dias');
  });

  it('orienta quem não comprou a ignorar e não faz propaganda', () => {
    expect(email.textBody).toContain('Se você não comprou o acesso, ignore este e-mail');
  });
});
