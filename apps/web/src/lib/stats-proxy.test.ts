import { describe, expect, it, vi } from 'vitest';
import {
  STATS_MAX_BODY_BYTES,
  proxyStatsEvent,
  proxyStatsScript,
  withoutQuery,
} from './stats-proxy';

const event = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://flightwatch.com.br/stats/api/send', { method: 'POST', body, headers });

describe('proxy da estatística (SPEC-042)', () => {
  it('404 sem UMAMI_INTERNAL_URL (AC-5: nada carregado)', async () => {
    const fetchImpl = vi.fn();
    expect((await proxyStatsScript(undefined, fetchImpl)).status).toBe(404);
    expect((await proxyStatsEvent(event('{}'), undefined, fetchImpl)).status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('serve o script do Umami como JavaScript', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('(()=>{})()'));
    const response = await proxyStatsScript('http://umami:3000', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('http://umami:3000/script.js', expect.anything());
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toBe('(()=>{})()');
  });

  it('repassa só os cabeçalhos de contagem, nunca cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"cache":"x"}', { status: 200 }));
    await proxyStatsEvent(
      event('{"type":"event"}', {
        'user-agent': 'Firefox',
        'cf-connecting-ip': '203.0.113.9',
        cookie: 'fw_session=segredo',
      }),
      'http://umami:3000',
      fetchImpl,
    );
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sent = new Headers(init.headers);
    expect(url).toBe('http://umami:3000/api/send');
    expect(sent.get('user-agent')).toBe('Firefox');
    expect(sent.get('cf-connecting-ip')).toBe('203.0.113.9');
    expect(sent.get('cookie')).toBeNull();
  });

  it('tira a query (tokens de e-mail) da página e da origem antes de repassar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await proxyStatsEvent(
      event(
        JSON.stringify({
          type: 'event',
          payload: {
            website: 'id',
            url: '/reset-password?token=segredo#x',
            referrer: 'https://mail.example.com/inbox?u=1',
          },
        }),
      ),
      'http://umami:3000',
      fetchImpl,
    );
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { payload: { url: string; referrer: string } };
    expect(sent.payload.url).toBe('/reset-password');
    expect(sent.payload.referrer).toBe('https://mail.example.com/inbox');
    expect(String(init.body)).not.toContain('segredo');
  });

  it('withoutQuery mantém o caminho, relativo ou absoluto', () => {
    expect(withoutQuery('/voos/sao-rio?x=1')).toBe('/voos/sao-rio');
    expect(withoutQuery('https://flightwatch.com.br/a?b=c#d')).toBe('https://flightwatch.com.br/a');
  });

  it('recusa corpo que não é JSON', async () => {
    const fetchImpl = vi.fn();
    expect(
      (await proxyStatsEvent(event('não é json'), 'http://umami:3000', fetchImpl)).status,
    ).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('recusa corpo grande e não quebra com o Umami fora', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    const big = 'x'.repeat(STATS_MAX_BODY_BYTES + 1);
    expect((await proxyStatsEvent(event(big), 'http://umami:3000', fetchImpl)).status).toBe(413);
    expect((await proxyStatsEvent(event('{}'), 'http://umami:3000', fetchImpl)).status).toBe(502);
    expect((await proxyStatsScript('http://umami:3000', fetchImpl)).status).toBe(502);
  });
});
