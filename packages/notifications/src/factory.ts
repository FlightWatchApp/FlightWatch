import type { EmailSender } from './email/port.js';
import { createResendEmailSender } from './resend/resend-email-sender.js';
import { InMemoryEmailSender } from './simulated/in-memory-email-sender.js';

/** Valores aceitos por `EMAIL_PROVIDER` (SPEC-024). Adapter novo entra aqui. */
export type EmailProviderKind = 'simulated' | 'resend';

/** Subconjunto da configuração dos processos que a fábrica precisa (SPEC-024). */
export interface EmailSenderConfig {
  EMAIL_PROVIDER: EmailProviderKind;
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
  EMAIL_PROVIDER_TIMEOUT_MS?: number | undefined;
}

export function createEmailSender(config: EmailSenderConfig): EmailSender {
  switch (config.EMAIL_PROVIDER) {
    case 'simulated':
      return new InMemoryEmailSender();
    case 'resend': {
      // A config já exige as duas chaves com este provedor; isto protege quem
      // chamar a fábrica sem passar por `loadConfig`.
      if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
        throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM');
      }
      return createResendEmailSender({
        apiKey: config.RESEND_API_KEY,
        from: config.EMAIL_FROM,
        ...(config.EMAIL_PROVIDER_TIMEOUT_MS
          ? { timeoutMs: config.EMAIL_PROVIDER_TIMEOUT_MS }
          : {}),
      });
    }
  }
}
