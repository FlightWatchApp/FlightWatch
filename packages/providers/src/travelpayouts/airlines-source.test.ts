import { describe, expect, it } from 'vitest';
import { fetchTravelpayoutsAirlines, parseTravelpayoutsAirlines } from './airlines-source.js';

describe('parseTravelpayoutsAirlines (SPEC-038)', () => {
  it('usa o nome em português e, sem ele, o inglês; descarta código inválido ou sem nome', () => {
    const parsed = parseTravelpayoutsAirlines([
      { code: 'AD', name: 'Azul Airlines', name_translations: { en: 'Azul Airlines' } },
      { code: 'G3', name: null, name_translations: { en: 'Gol Transportes Aéreos' } },
      { code: 'XXX', name: 'Código de 3 letras' },
      { code: 'JJ', name: null, name_translations: {} },
      'lixo',
    ]);
    expect(parsed.airlines).toEqual([
      { code: 'AD', name: 'Azul Airlines' },
      { code: 'G3', name: 'Gol Transportes Aéreos' },
    ]);
    expect(parsed.invalid).toBe(3);
  });

  it('erro HTTP vira UNAVAILABLE', async () => {
    const fetchFn = (async () => new Response('x', { status: 503 })) as typeof fetch;
    await expect(fetchTravelpayoutsAirlines({ timeoutMs: 1000, fetchFn })).rejects.toMatchObject({
      errorClass: 'UNAVAILABLE',
    });
  });
});
