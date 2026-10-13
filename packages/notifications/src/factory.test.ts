import { describe, expect, it } from 'vitest';
import { createEmailSender } from './factory.js';
import { InMemoryEmailSender } from './simulated/in-memory-email-sender.js';

describe('createEmailSender', () => {
  it('devolve o remetente simulado por padrão', () => {
    expect(createEmailSender({ EMAIL_PROVIDER: 'simulated' })).toBeInstanceOf(InMemoryEmailSender);
  });

  it('cria o adapter real com credenciais', () => {
    const sender = createEmailSender({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_0123456789abcdef',
      EMAIL_FROM: 'a@exemplo.com.br',
    });
    expect(sender).not.toBeInstanceOf(InMemoryEmailSender);
  });

  it('recusa resend sem credenciais, sem ecoar valores', () => {
    expect(() => createEmailSender({ EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });
});
