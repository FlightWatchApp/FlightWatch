import { describe, expect, it, vi } from 'vitest';
import { healthResponse } from './health';

describe('healthResponse (SPEC-042 AC-4)', () => {
  it('200 quando a API responde /health', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const response = await healthResponse('http://api:3000', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('http://api:3000/health', expect.anything());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('503 quando a API responde com erro', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    expect((await healthResponse('http://api:3000', fetchImpl)).status).toBe(503);
  });

  it('503 sem detalhe quando a API está fora', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3000'));
    const response = await healthResponse('http://api:3000', fetchImpl);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('ECONNREFUSED');
  });
});
