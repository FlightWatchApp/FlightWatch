import type { EmailSender } from './email/port.js';
import { ResendEmailSender } from './resend/resend-email-sender.js';
import { InMemoryEmailSender } from './simulated/in-memory-email-sender.js';

/** Valores aceitos por `EMAIL_PROVIDER` (SPEC-024, SPEC-035). Adapter real entra aqui. */
export type EmailProviderKind = 'simulated' | 'resend';

export interface EmailSenderSettings {
  kind: EmailProviderKind;
  /** Obrigatória com `resend` (a configuração garante no startup). */
  resendApiKey?: string | undefined;
  /** Remetente; obrigatório com `resend`. */
  from?: string | undefined;
  timeoutMs: number;
}

export function createEmailSender(settings: EmailSenderSettings): EmailSender {
  switch (settings.kind) {
    case 'simulated':
      return new InMemoryEmailSender();
    case 'resend':
      if (!settings.resendApiKey || !settings.from) {
        // Defesa: loadConfig já recusa isso no startup (SPEC-035 AC-1).
        throw new Error('resend: RESEND_API_KEY e EMAIL_FROM são obrigatórias');
      }
      return new ResendEmailSender({
        apiKey: settings.resendApiKey,
        from: settings.from,
        timeoutMs: settings.timeoutMs,
      });
  }
}
