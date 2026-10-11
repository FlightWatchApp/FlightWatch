import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmailSender } from '../factory.js';
import { FileOutboxEmailSender } from './file-outbox-email-sender.js';

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

const message = {
  to: 'a@example.com',
  subject: 'Assunto',
  textBody: 'Abra https://exemplo.test/verify-email?token=abc',
  idempotencyKey: 'verify:user/1',
};

describe('FileOutboxEmailSender', () => {
  it('grava o e-mail em arquivo e reenviar a mesma chave reescreve o mesmo arquivo', async () => {
    directory = await mkdtemp(join(tmpdir(), 'fw-outbox-'));
    const sender = new FileOutboxEmailSender(join(directory, 'nova'));
    const first = await sender.send(message);
    const second = await sender.send(message);
    expect(second).toEqual(first);
    const files = await readdir(join(directory, 'nova'));
    expect(files).toEqual(['verify_user_1.json']);
    const saved = JSON.parse(await readFile(join(directory, 'nova', String(files[0])), 'utf8'));
    expect(saved).toMatchObject({ to: 'a@example.com', textBody: message.textBody });
  });

  it('a fábrica só usa a pasta com o provedor simulado', () => {
    expect(
      createEmailSender({ EMAIL_PROVIDER: 'simulated', EMAIL_OUTBOX_DIR: '/tmp/x' }),
    ).toBeInstanceOf(FileOutboxEmailSender);
  });
});
