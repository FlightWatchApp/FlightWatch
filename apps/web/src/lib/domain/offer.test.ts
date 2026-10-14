import { describe, expect, it } from 'vitest';
import { airlineLogoUrl, flightLabel, isOfferDate, localDepartureTime } from './offer';
import { offerPath } from './route-url';

describe('oferta (SPEC-038)', () => {
  it('horário local da origem, sem converter fuso', () => {
    expect(localDepartureTime('2026-11-29T23:40:00-03:00')).toBe('23:40');
    expect(localDepartureTime('sem hora')).toBeNull();
  });

  it('rótulo do voo com e sem nome no catálogo', () => {
    expect(
      flightLabel({ carrierCode: 'AD', carrierName: 'Azul Airlines', flightNumber: '4193' }),
    ).toBe('Azul Airlines · AD 4193');
    expect(flightLabel({ carrierCode: 'G3', carrierName: null, flightNumber: null })).toBe('G3');
  });

  it('logo pelo código e data válida da URL', () => {
    expect(airlineLogoUrl('AD')).toBe('https://pics.avs.io/120/120/AD.png');
    expect(isOfferDate('2026-11-29')).toBe(true);
    expect(isOfferDate('2026-02-30')).toBe(false);
    expect(isOfferDate('amanha')).toBe(false);
  });

  it('caminho da oferta é a rota canônica mais a data', () => {
    expect(
      offerPath(
        { code: 'SAO', name: 'São Paulo' },
        { code: 'RIO', name: 'Rio de Janeiro' },
        '2026-11-29',
      ),
    ).toBe('/voos/sao-paulo-sao-para-rio-de-janeiro-rio/2026-11-29');
  });
});
