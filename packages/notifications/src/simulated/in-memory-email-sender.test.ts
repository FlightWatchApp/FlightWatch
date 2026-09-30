import { describe, expect, it } from 'vitest';
import { EmailDeliveryError } from '../email/errors.js';
import type { EmailMessage } from '../email/port.js';
import { InMemoryEmailSender, failingSendBehavior } from './in-memory-email-sender.js';

const message: EmailMessage = {
  to: 'user@example.com',
  subject: 'test',
  textBody: 'body',
  idempotencyKey: 'key-1',
};

describe('InMemoryEmailSender', () => {
  it('records the sent message and returns a deterministic provider id', async () => {
    const sender = new InMemoryEmailSender();
    const result = await sender.send(message);
    expect(result.providerMessageId).toBe('sim-key-1');
    expect(sender.sent).toEqual([message]);
  });

  it('rejects with a classified EmailDeliveryError instead of throwing synchronously', async () => {
    const sender = new InMemoryEmailSender(failingSendBehavior('TIMEOUT', 'simulated timeout'));
    await expect(sender.send(message)).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(sender.send(message)).rejects.toMatchObject({
      errorClass: 'TIMEOUT',
      retryable: true,
    });
    expect(sender.sent).toHaveLength(0);
  });

  it('marks PERMANENT_BOUNCE as not retryable', async () => {
    const sender = new InMemoryEmailSender(
      failingSendBehavior('PERMANENT_BOUNCE', 'invalid address'),
    );
    await expect(sender.send(message)).rejects.toMatchObject({ retryable: false });
  });

  // SPEC-012 §3: contrato da porta — uma segunda chamada com a mesma
  // idempotencyKey não pode gerar um segundo envio real (é o que torna seguro
  // reenviar uma entrega presa em SENDING sem saber se o envio original saiu).
  it('does not send twice for a repeated idempotencyKey after a successful send', async () => {
    const sender = new InMemoryEmailSender();

    const first = await sender.send(message);
    const second = await sender.send({ ...message, textBody: 'a different body, same key' });

    expect(second).toEqual(first);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toEqual(message);
  });

  it('does attempt a real send again after a failure with the same idempotencyKey', async () => {
    let attempts = 0;
    const sender = new InMemoryEmailSender((msg) => {
      attempts += 1;
      if (attempts === 1) {
        throw new EmailDeliveryError('TIMEOUT', 'simulated timeout');
      }
      return { providerMessageId: `sim-${msg.idempotencyKey}` };
    });

    await expect(sender.send(message)).rejects.toBeInstanceOf(EmailDeliveryError);
    const result = await sender.send(message);

    expect(attempts).toBe(2);
    expect(result.providerMessageId).toBe('sim-key-1');
    expect(sender.sent).toHaveLength(1);
  });
});
