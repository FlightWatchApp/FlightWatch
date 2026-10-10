import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError } from '../email/errors.js';
import { createResendEmailSender } from './resend-email-sender.js';

const message = {
  to: 'maria@example.com',
  subject: 'Preço caiu',
  textBody: 'Corpo do alerta',
  idempotencyKey: 'delivery-123',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function senderWith(fetchImpl: typeof fetch) {
  return createResendEmailSender({
    apiKey: 're_test_key_1234567890',
    from: 'Flight Watch <alertas@exemplo.com.br>',
    fetch: fetchImpl,
    timeoutMs: 50,
  });
}

async function errorOf(promise: Promise<unknown>): Promise<EmailDeliveryError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EmailDeliveryError);
  return error as EmailDeliveryError;
}

describe('createResendEmailSender', () => {
  it('envia pela API da Resend com chave de idempotência e devolve o id da mensagem', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'msg_abc' }));

    const result = await senderWith(fetchMock as unknown as typeof fetch).send(message);

    expect(result).toEqual({ providerMessageId: 'msg_abc' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_key_1234567890');
    expect(headers['Idempotency-Key']).toBe('delivery-123');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Flight Watch <alertas@exemplo.com.br>',
      to: ['maria@example.com'],
      subject: 'Preço caiu',
      text: 'Corpo do alerta',
    });
  });

  it('classifica 429 como RATE_LIMITED (retentável)', async () => {
    const error = await errorOf(
      senderWith((async () => jsonResponse(429, { message: 'slow down' })) as typeof fetch).send(
        message,
      ),
    );
    expect(error.errorClass).toBe('RATE_LIMITED');
    expect(error.retryable).toBe(true);
  });

  it.each([500, 502, 503])(
    'classifica %i como TEMPORARY_UNAVAILABLE (retentável)',
    async (status) => {
      const error = await errorOf(
        senderWith((async () => jsonResponse(status, {})) as typeof fetch).send(message),
      );
      expect(error.errorClass).toBe('TEMPORARY_UNAVAILABLE');
      expect(error.retryable).toBe(true);
    },
  );

  it.each([400, 401, 403, 422])(
    'classifica %i como PERMANENT_BOUNCE (não retentável)',
    async (status) => {
      const error = await errorOf(
        senderWith((async () => jsonResponse(status, { message: 'invalid' })) as typeof fetch).send(
          message,
        ),
      );
      expect(error.errorClass).toBe('PERMANENT_BOUNCE');
      expect(error.retryable).toBe(false);
    },
  );

  it('trata 409 (idempotência em andamento) como temporário', async () => {
    const error = await errorOf(
      senderWith((async () => jsonResponse(409, {})) as typeof fetch).send(message),
    );
    expect(error.retryable).toBe(true);
  });

  it('classifica estouro de tempo como TIMEOUT (retentável)', async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as typeof fetch;

    const error = await errorOf(senderWith(hanging).send(message));
    expect(error.errorClass).toBe('TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('classifica falha de rede como TEMPORARY_UNAVAILABLE', async () => {
    const error = await errorOf(
      senderWith((async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch).send(message),
    );
    expect(error.errorClass).toBe('TEMPORARY_UNAVAILABLE');
  });

  it('não vaza a chave nem o destinatário na mensagem de erro', async () => {
    const error = await errorOf(
      senderWith((async () => jsonResponse(422, { message: 'bad' })) as typeof fetch).send(message),
    );
    expect(error.message).not.toContain('re_test_key');
    expect(error.message).not.toContain('maria@example.com');
  });
});
