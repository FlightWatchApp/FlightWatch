import type { EmailSender } from './email/port.js';
import { InMemoryEmailSender } from './simulated/in-memory-email-sender.js';

/** Valores aceitos por `EMAIL_PROVIDER` (SPEC-024). Adapter real entra aqui. */
export type EmailProviderKind = 'simulated';

export function createEmailSender(kind: EmailProviderKind): EmailSender {
  switch (kind) {
    case 'simulated':
      return new InMemoryEmailSender();
  }
}
