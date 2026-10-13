import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmailMessage, EmailSendResult, EmailSender } from '../email/port.js';
import { InMemoryEmailSender } from './in-memory-email-sender.js';

/**
 * Para E2E: igual ao simulado em memória, mas cada e-mail também vira um
 * arquivo JSON numa pasta, que o teste lê para pegar links de confirmação e
 * redefinição (processos diferentes não compartilham memória). Idempotente
 * pela chave, como a porta exige: o mesmo envio reescreve o mesmo arquivo.
 * Só existe com `EMAIL_PROVIDER=simulated`, que a produção rejeita.
 */
export class FileOutboxEmailSender implements EmailSender {
  private readonly inner = new InMemoryEmailSender();

  constructor(private readonly directory: string) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const result = await this.inner.send(message);
    await mkdir(this.directory, { recursive: true });
    const safeKey = message.idempotencyKey.replace(/[^A-Za-z0-9._-]/g, '_');
    await writeFile(
      join(this.directory, `${safeKey}.json`),
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2),
    );
    return result;
  }
}
