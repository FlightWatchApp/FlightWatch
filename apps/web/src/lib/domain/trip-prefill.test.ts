import { describe, expect, it } from 'vitest';
import { buildWatchPrefillHref, parseWatchPrefill } from './trip-prefill';

describe('buildWatchPrefillHref (SPEC-045)', () => {
  it('só ida', () => {
    expect(
      buildWatchPrefillHref({
        origin: 'SAO',
        destination: 'RIO',
        tripType: 'ONE_WAY',
        departureDate: '2026-11-14',
        returnDate: null,
      }),
    ).toBe('/watches/new?origin=SAO&destination=RIO&tripType=ONE_WAY&departureDate=2026-11-14');
  });

  it('ida e volta leva a data de volta', () => {
    expect(
      buildWatchPrefillHref({
        origin: 'CGR',
        destination: 'VIX',
        tripType: 'ROUND_TRIP',
        departureDate: '2026-11-14',
        returnDate: '2026-11-20',
      }),
    ).toBe(
      '/watches/new?origin=CGR&destination=VIX&tripType=ROUND_TRIP&departureDate=2026-11-14&returnDate=2026-11-20',
    );
  });
});

describe('parseWatchPrefill (SPEC-045)', () => {
  it('lê uma viagem completa', () => {
    expect(
      parseWatchPrefill({
        origin: 'SAO',
        destination: 'RIO',
        tripType: 'ROUND_TRIP',
        departureDate: '2026-11-14',
        returnDate: '2026-11-20',
      }),
    ).toEqual({
      origin: 'SAO',
      destination: 'RIO',
      tripType: 'ROUND_TRIP',
      departureDate: '2026-11-14',
      returnDate: '2026-11-20',
    });
  });

  it('aceita minúsculas nos códigos e o primeiro valor de um parâmetro repetido', () => {
    const result = parseWatchPrefill({ origin: ['sao', 'x'], destination: 'rio' });
    expect(result.origin).toBe('SAO');
    expect(result.destination).toBe('RIO');
  });

  it('ignora cada parte inválida sem lançar e sem derrubar as outras', () => {
    const result = parseWatchPrefill({
      origin: 'SAOPAULO',
      destination: 'R/O',
      tripType: 'MULTI',
      departureDate: '14/11/2026',
      returnDate: '2026-11-20?x=1',
    });
    expect(result).toEqual({
      origin: null,
      destination: null,
      tripType: 'ONE_WAY',
      departureDate: '',
      returnDate: '',
    });
  });

  it('só ida descarta a data de volta, e volta antes da ida é descartada', () => {
    expect(
      parseWatchPrefill({
        tripType: 'ONE_WAY',
        departureDate: '2026-11-14',
        returnDate: '2026-11-20',
      }).returnDate,
    ).toBe('');
    expect(
      parseWatchPrefill({
        tripType: 'ROUND_TRIP',
        departureDate: '2026-11-14',
        returnDate: '2026-11-10',
      }).returnDate,
    ).toBe('');
  });

  it('sem parâmetros, devolve o formulário vazio', () => {
    expect(parseWatchPrefill({})).toEqual({
      origin: null,
      destination: null,
      tripType: 'ONE_WAY',
      departureDate: '',
      returnDate: '',
    });
  });
});
