import { describe, expect, it } from 'vitest';
import { TurnstileVerifier } from './captcha.js';

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; body: string }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body) });
    return respond();
  }) as typeof fetch;
  return { fn, calls };
}

// SPEC-041: veredito do siteverify da Cloudflare.
describe('TurnstileVerifier', () => {
  it('success true aprova e manda segredo, token e IP do cliente', async () => {
    const { fn, calls } = fakeFetch(() => Response.json({ success: true }));
    const verdict = await new TurnstileVerifier('segredo-0123456789', fn).verify(
      'tok',
      '203.0.113.9',
    );
    expect(verdict).toBe('passed');
    expect(calls[0]?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = new URLSearchParams(calls[0]?.body);
    expect(Object.fromEntries(body)).toEqual({
      secret: 'segredo-0123456789',
      response: 'tok',
      remoteip: '203.0.113.9',
    });
  });

  it('success false recusa', async () => {
    const { fn } = fakeFetch(() => Response.json({ success: false, 'error-codes': ['invalid'] }));
    expect(await new TurnstileVerifier('s', fn).verify('tok', '203.0.113.9')).toBe('failed');
  });

  it('rede fora, HTTP de erro ou corpo inválido viram indisponível', async () => {
    const down = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await new TurnstileVerifier('s', down.fn).verify('tok', '1.1.1.1')).toBe('unavailable');
    const http = fakeFetch(() => new Response('erro', { status: 503 }));
    expect(await new TurnstileVerifier('s', http.fn).verify('tok', '1.1.1.1')).toBe('unavailable');
    const junk = fakeFetch(() => new Response('não é json'));
    expect(await new TurnstileVerifier('s', junk.fn).verify('tok', '1.1.1.1')).toBe('unavailable');
  });
});
