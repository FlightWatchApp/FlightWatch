import { describe, expect, it } from 'vitest';
import { resolvePurchaseUrl } from './purchase-link.js';
import { buildDecolarSearchUrl, type PurchaseTrip } from './purchase-partner.js';

const ONE_WAY: PurchaseTrip = {
  originCode: 'SAO',
  destinationCode: 'RIO',
  tripType: 'ONE_WAY',
  departureDate: '2026-11-14',
  returnDate: null,
  adults: 1,
};

const ROUND_TRIP: PurchaseTrip = {
  originCode: 'CGR',
  destinationCode: 'VIX',
  tripType: 'ROUND_TRIP',
  departureDate: '2026-11-14',
  returnDate: '2026-11-20',
  adults: 1,
};

describe('buildDecolarSearchUrl (SPEC-044)', () => {
  // Os três endereços abaixo foram copiados da barra do navegador, de buscas
  // feitas à mão no site da Decolar em 2026-10-26: são o gabarito do formato.
  describe('reproduz as buscas reais feitas no site', () => {
    it('só ida, 1 adulto', () => {
      expect(buildDecolarSearchUrl(ONE_WAY)).toBe(
        'https://www.decolar.com/shop/flights/results/oneway/SAO/RIO/2026-11-14/1/0/0?from=SB&di=1',
      );
    });

    it('ida e volta, 1 adulto', () => {
      expect(buildDecolarSearchUrl(ROUND_TRIP)).toBe(
        'https://www.decolar.com/shop/flights/results/multioneway/CGR/VIX/2026-11-14/2026-11-20/1/0/0?from=SB&di=1&isRedirectFromRoundtrip=true',
      );
    });

    it('ida e volta, 2 adultos', () => {
      expect(buildDecolarSearchUrl({ ...ROUND_TRIP, adults: 2 })).toBe(
        'https://www.decolar.com/shop/flights/results/multioneway/CGR/VIX/2026-11-14/2026-11-20/2/0/0?from=SB&di=2&isRedirectFromRoundtrip=true',
      );
    });
  });

  it('passageiros entram nos dois lugares do formato (caminho e di)', () => {
    const url = buildDecolarSearchUrl({ ...ONE_WAY, adults: 3 });
    expect(url).toContain('/2026-11-14/3/0/0?');
    expect(url).toContain('&di=3');
  });

  describe('nunca monta link a partir de dado inválido (devolve null, não lança)', () => {
    it.each([
      ['origem em minúsculas', { originCode: 'sao' }],
      ['origem com 4 letras', { originCode: 'SAOP' }],
      ['destino com caractere de caminho', { destinationCode: 'R/O' }],
      ['destino vazio', { destinationCode: '' }],
      ['data fora do formato', { departureDate: '14/11/2026' }],
      ['data com texto no fim', { departureDate: '2026-11-14?x=1' }],
      ['zero adultos', { adults: 0 }],
      ['adultos fracionados', { adults: 1.5 }],
      ['adultos demais', { adults: 10 }],
    ])('%s', (_name, override) => {
      expect(buildDecolarSearchUrl({ ...ONE_WAY, ...override })).toBeNull();
    });

    it('ida e volta sem data de volta', () => {
      expect(buildDecolarSearchUrl({ ...ROUND_TRIP, returnDate: null })).toBeNull();
    });

    it('só ida com data de volta', () => {
      expect(buildDecolarSearchUrl({ ...ONE_WAY, returnDate: '2026-11-20' })).toBeNull();
    });

    it('volta antes ou no mesmo dia da ida', () => {
      expect(buildDecolarSearchUrl({ ...ROUND_TRIP, returnDate: '2026-11-14' })).toBeNull();
      expect(buildDecolarSearchUrl({ ...ROUND_TRIP, returnDate: '2026-11-01' })).toBeNull();
    });
  });

  it('o link gerado passa na allowlist do destino DECOLAR e só nela', () => {
    const url = buildDecolarSearchUrl(ONE_WAY);
    expect(resolvePurchaseUrl(url, 'DECOLAR')).toBe(url);
    // Outro destino não aceita o host da Decolar.
    expect(resolvePurchaseUrl(url, 'TRAVELPAYOUTS')).toBeNull();
  });
});
