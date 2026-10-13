import { describe, expect, it } from 'vitest';
import { createEmailSender } from './factory.js';
import { ResendEmailSender } from './resend/resend-email-sender.js';
import { InMemoryEmailSender } from './simulated/in-memory-email-sender.js';

describe('createEmailSender (SPEC-035)', () => {
  it('simulated continua o carteiro em memória', () => {
    expect(createEmailSender({ kind: 'simulated', timeoutMs: 1000 })).toBeInstanceOf(
      InMemoryEmailSender,
    );
  });

  it('resend com chave e remetente', () => {
    const sender = createEmailSender({
      kind: 'resend',
      resendApiKey: 're_chave_de_teste_0123456789',
      from: 'Flight Watch <onboarding@resend.dev>',
      timeoutMs: 1000,
    });
    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it('resend sem chave falha sem ecoar segredo', () => {
    expect(() => createEmailSender({ kind: 'resend', from: 'a@b.co', timeoutMs: 1000 })).toThrow(
      /RESEND_API_KEY/,
    );
  });
});
