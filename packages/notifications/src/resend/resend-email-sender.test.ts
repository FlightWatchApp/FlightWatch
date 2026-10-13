import { describe, expect, it } from 'vitest';
import { EmailDeliveryError, type EmailDeliveryErrorClass } from '../email/errors.js';
import { ResendEmailSender } from './resend-email-sender.js';

const API_KEY = 're_test_secret_key_123456';
const MESSAGE = {
  to: 'pessoa@example.com',
  subject: 'Preço caiu',
  textBody: 'SAO → LIS por R$ 1.423',
  idempotencyKey: 'a'.repeat(64),
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sender(fetchFn: typeof fetch, timeoutMs = 1000) {
  return new ResendEmailSender({
    apiKey: API_KEY,
    from: 'Flight Watch <onboarding@resend.dev>',
    timeoutMs,
    fetchFn,
  });
}

async function errorOf(promise: Promise<unknown>): Promise<EmailDeliveryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EmailDeliveryError) return error;
    throw error;
  }
  throw new Error('esperava EmailDeliveryError');
}

describe('ResendEmailSender (SPEC-035)', () => {
  // AC-2
  it('envia from, to, subject, text, Authorization e Idempotency-Key; devolve o id', async () => {
    const { calls, fetchFn } = fakeFetch(() => json(200, { id: 'resend-id-1' }));

    const result = await sender(fetchFn).send(MESSAGE);

    expect(result).toEqual({ providerMessageId: 'resend-id-1' });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://api.resend.com/emails');
    expect(call?.init.method).toBe('POST');
    const headers = new Headers(call?.init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headers.get('idempotency-key')).toBe(MESSAGE.idempotencyKey);
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(call?.init.body))).toEqual({
      from: 'Flight Watch <onboarding@resend.dev>',
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.textBody,
    });
  });

  // AC-3
  it('chave de idempotência acima de 256 caracteres vira SHA-256 estável', async () => {
    const { calls, fetchFn } = fakeFetch(() => json(200, { id: 'x' }));
    const long = { ...MESSAGE, idempotencyKey: 'k'.repeat(300) };

    await sender(fetchFn).send(long);
    await sender(fetchFn).send(long);

    const keys = calls.map((call) => new Headers(call.init.headers).get('idempotency-key'));
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  // AC-4
  it.each<[string, number, unknown, EmailDeliveryErrorClass, boolean]>([
    ['429 rate limit', 429, { name: 'rate_limit_exceeded' }, 'RATE_LIMITED', true],
    ['429 cota diária', 429, { name: 'daily_quota_exceeded' }, 'RATE_LIMITED', true],
    [
      '409 envio em curso',
      409,
      { name: 'concurrent_idempotent_requests' },
      'TEMPORARY_UNAVAILABLE',
      true,
    ],
    ['500', 500, { name: 'application_error' }, 'TEMPORARY_UNAVAILABLE', true],
    ['503', 503, { name: 'service_unavailable' }, 'TEMPORARY_UNAVAILABLE', true],
    ['401 sem chave', 401, { name: 'missing_api_key' }, 'PROVIDER_CONFIGURATION', true],
    [
      '403 domínio não verificado',
      403,
      { name: 'validation_error' },
      'PROVIDER_CONFIGURATION',
      true,
    ],
    ['403 chave suspensa', 403, { name: 'suspended_api_key' }, 'PROVIDER_CONFIGURATION', true],
    ['400 pedido inválido', 400, { name: 'validation_error' }, 'REJECTED', false],
    ['422 campo faltando', 422, { name: 'missing_required_field' }, 'REJECTED', false],
    ['409 chave com outro corpo', 409, { name: 'invalid_idempotent_request' }, 'REJECTED', false],
  ])('%s → %s', async (_label, status, body, errorClass, retryable) => {
    const { fetchFn } = fakeFetch(() => json(status, body));

    const error = await errorOf(sender(fetchFn).send(MESSAGE));

    expect(error.errorClass).toBe(errorClass);
    expect(error.retryable).toBe(retryable);
  });

  // AC-5
  it('timeout vira TIMEOUT', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'TimeoutError')),
        );
      })) as typeof fetch;

    const error = await errorOf(sender(fetchFn, 20).send(MESSAGE));

    expect(error.errorClass).toBe('TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('falha de rede vira TIMEOUT (transitória)', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    const error = await errorOf(sender(fetchFn).send(MESSAGE));
    expect(error.errorClass).toBe('TIMEOUT');
  });

  // AC-6
  it('mensagem de erro não contém a chave nem o destinatário', async () => {
    const { fetchFn } = fakeFetch(() =>
      json(403, { name: 'validation_error', message: `can only send to ${MESSAGE.to}` }),
    );

    const error = await errorOf(sender(fetchFn).send(MESSAGE));

    expect(error.message).not.toContain(API_KEY);
    expect(error.message).not.toContain(MESSAGE.to);
    expect(error.message).toContain('403');
  });

  it('resposta 200 sem id é tratada como falha transitória', async () => {
    const { fetchFn } = fakeFetch(() => json(200, {}));
    const error = await errorOf(sender(fetchFn).send(MESSAGE));
    expect(error.errorClass).toBe('TEMPORARY_UNAVAILABLE');
  });
});
