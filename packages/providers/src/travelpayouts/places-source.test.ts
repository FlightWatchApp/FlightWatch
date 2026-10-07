import { describe, expect, it } from 'vitest';
import { parseTravelpayoutsPlaces } from './places-source.js';

/** Fixtures no formato real de data/pt/{countries,cities,airports}.json. */
const countries = [
  { code: 'BR', name: 'Brasil', name_translations: { en: 'Brazil' } },
  { code: 'US', name: 'EUA', name_translations: { en: 'United States' } },
  { code: 'ID', name: 'Indonésia', name_translations: { en: 'Indonesia' } },
];

const cities = [
  {
    code: 'SAO',
    name: 'São Paulo',
    name_translations: { en: 'Sao Paulo' },
    country_code: 'BR',
    time_zone: 'America/Sao_Paulo',
    coordinates: { lat: -23.55, lon: -46.63 },
    has_flightable_airport: true,
  },
  {
    code: 'NYC',
    name: 'Nova Iorque',
    name_translations: { en: 'New York' },
    country_code: 'US',
    time_zone: 'America/New_York',
    coordinates: { lat: 40.71, lon: -74.0 },
    has_flightable_airport: true,
  },
  // Sem nome em português: usa o inglês.
  {
    code: 'AKQ',
    name: null,
    name_translations: { en: 'Astraksetra' },
    country_code: 'ID',
    time_zone: 'Asia/Jakarta',
    coordinates: { lat: -4.61, lon: 105.23 },
    has_flightable_airport: false,
  },
  // Inválidas: código fora do padrão, sem nome nenhum, coordenada fora da faixa.
  { code: 'SA1', name: 'Errada', country_code: 'BR', has_flightable_airport: true },
  { code: 'XXX', name: null, name_translations: {}, country_code: 'BR' },
  {
    code: 'BAD',
    name: 'Coordenada ruim',
    country_code: 'BR',
    coordinates: { lat: 120, lon: 0 },
    has_flightable_airport: false,
  },
];

const airports = [
  {
    code: 'GRU',
    name: 'Guarulhos Cumbica SP',
    name_translations: { en: 'Sao Paulo-Guarulhos International Airport' },
    city_code: 'SAO',
    country_code: 'BR',
    time_zone: 'America/Sao_Paulo',
    coordinates: { lat: -23.42, lon: -46.48 },
    iata_type: 'airport',
    flightable: true,
  },
  {
    code: 'CGH',
    name: null,
    name_translations: { en: 'Congonhas' },
    city_code: 'SAO',
    country_code: 'BR',
    time_zone: 'America/Sao_Paulo',
    coordinates: { lat: -23.62, lon: -46.65 },
    iata_type: 'airport',
    flightable: true,
  },
  {
    code: 'JFK',
    name: 'John F. Kennedy',
    name_translations: { en: 'John F. Kennedy International Airport' },
    city_code: 'NYC',
    country_code: 'US',
    time_zone: 'America/New_York',
    coordinates: { lat: 40.64, lon: -73.78 },
    iata_type: 'airport',
    flightable: true,
  },
  // Estação de trem: fora do catálogo de voos.
  {
    code: 'ZYP',
    name: 'Penn Station',
    city_code: 'NYC',
    country_code: 'US',
    coordinates: { lat: 40.75, lon: -73.99 },
    iata_type: 'railway',
    flightable: false,
  },
  // Aeroporto sem voo comercial: entra, mas não é pesquisável.
  {
    code: 'SKI',
    name: 'Pista particular',
    city_code: 'SAO',
    country_code: 'BR',
    coordinates: { lat: -23.5, lon: -46.6 },
    iata_type: 'airport',
    flightable: false,
  },
];

describe('parseTravelpayoutsPlaces (SPEC-029 AC-2)', () => {
  const result = parseTravelpayoutsPlaces({ countries, cities, airports });
  const byKey = new Map(result.places.map((place) => [`${place.kind}:${place.code}`, place]));

  it('grava cidades com nome, país, fuso e coordenadas', () => {
    expect(byKey.get('CITY:SAO')).toMatchObject({
      name: 'São Paulo',
      cityCode: 'SAO',
      countryCode: 'BR',
      countryName: 'Brasil',
      timeZone: 'America/Sao_Paulo',
      latitude: -23.55,
      longitude: -46.63,
      searchable: true,
    });
  });

  it('usa o nome em inglês quando falta o português', () => {
    expect(byKey.get('CITY:AKQ')?.name).toBe('Astraksetra');
    expect(byKey.get('AIRPORT:CGH')?.name).toBe('Congonhas');
  });

  it('busca da cidade inclui nomes em pt e en, país e aeroportos comerciais', () => {
    const text = byKey.get('CITY:SAO')?.searchText ?? '';
    for (const term of ['sao paulo', 'brasil', 'gru', 'cgh', 'guarulhos', 'congonhas']) {
      expect(text).toContain(term);
    }
    // Aeroporto sem voo comercial não entra na busca da cidade.
    expect(text).not.toContain('ski');
    expect(byKey.get('CITY:NYC')?.searchText).toContain('new york');
  });

  it('só aceita aeroportos (não estações) e marca os sem voo comercial', () => {
    expect(byKey.has('AIRPORT:ZYP')).toBe(false);
    expect(byKey.get('AIRPORT:GRU')?.searchable).toBe(true);
    expect(byKey.get('AIRPORT:SKI')?.searchable).toBe(false);
    expect(byKey.get('AIRPORT:GRU')?.cityCode).toBe('SAO');
  });

  it('descarta registros inválidos e conta', () => {
    expect(byKey.has('CITY:SA1')).toBe(false);
    expect(byKey.has('CITY:XXX')).toBe(false);
    expect(byKey.has('CITY:BAD')).toBe(false);
    expect(result.invalid).toEqual({ cities: 3, airports: 0 });
    expect(result.ignored).toEqual({ nonAirportTypes: 1 });
  });

  it('rejeita fonte que não seja lista', () => {
    expect(() => parseTravelpayoutsPlaces({ countries, cities: {}, airports })).toThrow(
      /MALFORMED|lista/i,
    );
  });
});
