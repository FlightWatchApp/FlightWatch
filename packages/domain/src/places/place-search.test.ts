import { describe, expect, it } from 'vitest';
import { normalizePlaceSearchText, rankPlaceMatches, shouldSyncPlaces } from './place-search.js';

describe('normalizePlaceSearchText (SPEC-029)', () => {
  it('remove acentos, caixa e espaços extras', () => {
    expect(normalizePlaceSearchText('  São   PAULO ')).toBe('sao paulo');
    expect(normalizePlaceSearchText('Brasília')).toBe('brasilia');
    expect(normalizePlaceSearchText('Zürich')).toBe('zurich');
  });

  it('mantém letras de outros alfabetos e números', () => {
    expect(normalizePlaceSearchText('Terminal 2')).toBe('terminal 2');
  });
});

describe('rankPlaceMatches (SPEC-029 AC-5)', () => {
  const saoPaulo = {
    code: 'SAO',
    name: 'São Paulo',
    airportCodes: ['GRU', 'CGH', 'VCP'],
    searchText: 'sao paulo brasil gru cgh vcp guarulhos congonhas viracopos',
  };
  const saoLuis = {
    code: 'SLZ',
    name: 'São Luís',
    airportCodes: ['SLZ'],
    searchText: 'sao luis brasil slz marechal cunha machado',
  };
  const lisboa = {
    code: 'LIS',
    name: 'Lisboa',
    airportCodes: ['LIS'],
    searchText: 'lisboa lisbon portugal lis humberto delgado',
  };
  const mossoro = {
    code: 'MVF',
    name: 'Mossoró',
    airportCodes: ['MVF'],
    searchText: 'mossoro brasil mvf dix sept rosado sao paulo street',
  };
  const all = [mossoro, lisboa, saoLuis, saoPaulo];

  it('código exato de cidade vem primeiro', () => {
    expect(rankPlaceMatches('sao', all)[0]?.code).toBe('SAO');
  });

  it('código exato de aeroporto leva à cidade dele', () => {
    expect(rankPlaceMatches('gru', all).map((place) => place.code)).toEqual(['SAO']);
  });

  it('nome que começa com o texto vem antes de quem só contém', () => {
    expect(rankPlaceMatches('são paulo', all).map((place) => place.code)).toEqual(['SAO', 'MVF']);
  });

  it('empata por nome, em ordem alfabética', () => {
    expect(rankPlaceMatches('sao l', all).map((place) => place.code)).toEqual(['SLZ']);
    expect(rankPlaceMatches('são', all).map((place) => place.code)).toEqual(['SAO', 'SLZ', 'MVF']);
  });

  // Achado com o catálogo real: o nome em pt é "Nova Iorque", mas o
  // brasileiro digita "nova york" — nenhuma substring contígua bate.
  it('acha quando todas as palavras digitadas aparecem, em qualquer ordem', () => {
    const novaIorque = {
      code: 'NYC',
      name: 'Nova Iorque',
      airportCodes: ['JFK', 'EWR', 'LGA'],
      searchText: 'nova iorque new york eua nyc jfk john f kennedy',
    };
    expect(rankPlaceMatches('nova york', [novaIorque]).map((place) => place.code)).toEqual(['NYC']);
    expect(rankPlaceMatches('york new', [novaIorque]).map((place) => place.code)).toEqual(['NYC']);
    expect(rankPlaceMatches('nova paris', [novaIorque])).toEqual([]);
  });

  // Achado com o catálogo real: "orlando" trazia Orlando (Noruega, 1
  // aeroporto) antes de Orlando (EUA, 3) — desempate só por nome.
  it('no empate, cidade com mais aeroportos comerciais vem antes', () => {
    const noruega = {
      code: 'OLA',
      name: 'Orlando',
      airportCodes: ['OLA'],
      searchText: 'orlando noruega ola',
    };
    const florida = {
      code: 'ORL',
      name: 'Orlando Flórida',
      airportCodes: ['MCO', 'ORL', 'SFB'],
      searchText: 'orlando florida eua orl mco sfb',
    };
    expect(rankPlaceMatches('orlando', [noruega, florida]).map((place) => place.code)).toEqual([
      'ORL',
      'OLA',
    ]);
  });

  it('acha pelo nome em outro idioma (searchText)', () => {
    expect(rankPlaceMatches('lisbon', all).map((place) => place.code)).toEqual(['LIS']);
  });

  it('texto com menos de 2 caracteres não devolve nada', () => {
    expect(rankPlaceMatches('s', all)).toEqual([]);
    expect(rankPlaceMatches('  ', all)).toEqual([]);
  });

  it('respeita o limite', () => {
    expect(rankPlaceMatches('sao', all, 1)).toHaveLength(1);
  });
});

describe('shouldSyncPlaces (SPEC-029 AC-4)', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('sincroniza quando o catálogo está vazio', () => {
    expect(shouldSyncPlaces(null, now)).toBe(true);
  });

  it('sincroniza quando a última sincronização tem 7 dias ou mais', () => {
    expect(shouldSyncPlaces(new Date('2026-09-29T12:00:00Z'), now)).toBe(true);
  });

  it('não sincroniza quando o catálogo é recente', () => {
    expect(shouldSyncPlaces(new Date('2026-10-01T12:00:00Z'), now)).toBe(false);
  });
});
