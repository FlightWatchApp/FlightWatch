import { type PlaceRecord, normalizePlaceSearchText } from '@flight-watch/domain';

/**
 * SPEC-029 — catálogo mínimo para testes (integração e e2e), no mesmo formato
 * que a sincronização grava. Não é usado em produção: lá o catálogo vem da
 * Travelpayouts.
 */

export function testCity(
  overrides: Partial<PlaceRecord> & { code: string; name: string; extraSearch?: string },
): PlaceRecord {
  const { extraSearch, ...record } = overrides;
  const countryName = record.countryName ?? 'Brasil';
  return {
    kind: 'CITY',
    cityCode: record.code,
    countryCode: 'BR',
    countryName,
    timeZone: 'America/Sao_Paulo',
    latitude: -15,
    longitude: -47,
    searchable: true,
    searchText: normalizePlaceSearchText(
      [record.name, countryName, record.code, extraSearch].filter(Boolean).join(' '),
    ),
    ...record,
  };
}

export function testAirport(
  overrides: Partial<PlaceRecord> & { code: string; cityCode: string; name: string },
): PlaceRecord {
  return {
    kind: 'AIRPORT',
    countryCode: 'BR',
    countryName: 'Brasil',
    timeZone: 'America/Sao_Paulo',
    latitude: -15,
    longitude: -47,
    searchable: true,
    searchText: normalizePlaceSearchText(`${overrides.name} ${overrides.code}`),
    ...overrides,
  };
}

/** Cobre os códigos usados nas suítes (DOU, GRU, CGH, GIG, BSB, JFK, MIA, LIS…). */
export const TEST_PLACES: readonly PlaceRecord[] = [
  testCity({
    code: 'SAO',
    name: 'São Paulo',
    latitude: -23.55,
    longitude: -46.63,
    extraSearch: 'sao paulo gru guarulhos cgh congonhas',
  }),
  testAirport({
    code: 'GRU',
    cityCode: 'SAO',
    name: 'Guarulhos',
    latitude: -23.43,
    longitude: -46.47,
  }),
  testAirport({
    code: 'CGH',
    cityCode: 'SAO',
    name: 'Congonhas',
    latitude: -23.62,
    longitude: -46.65,
  }),
  testCity({ code: 'RIO', name: 'Rio de Janeiro', extraSearch: 'gig galeao sdu santos dumont' }),
  testAirport({ code: 'GIG', cityCode: 'RIO', name: 'Galeão' }),
  testAirport({ code: 'SDU', cityCode: 'RIO', name: 'Santos Dumont' }),
  testCity({ code: 'DOU', name: 'Dourados', extraSearch: 'dou' }),
  testAirport({ code: 'DOU', cityCode: 'DOU', name: 'Dourados' }),
  testCity({ code: 'BSB', name: 'Brasília', extraSearch: 'bsb' }),
  testAirport({ code: 'BSB', cityCode: 'BSB', name: 'Presidente Juscelino Kubitschek' }),
  testCity({
    code: 'NYC',
    name: 'Nova Iorque',
    countryCode: 'US',
    countryName: 'EUA',
    timeZone: 'America/New_York',
    latitude: 40.71,
    longitude: -74.0,
    extraSearch: 'new york jfk john f kennedy',
  }),
  testAirport({
    code: 'JFK',
    cityCode: 'NYC',
    name: 'John F. Kennedy',
    countryCode: 'US',
    countryName: 'EUA',
  }),
  testCity({
    code: 'MIA',
    name: 'Miami',
    countryCode: 'US',
    countryName: 'EUA',
    extraSearch: 'mia',
  }),
  testAirport({
    code: 'MIA',
    cityCode: 'MIA',
    name: 'Miami',
    countryCode: 'US',
    countryName: 'EUA',
  }),
  testCity({
    code: 'LIS',
    name: 'Lisboa',
    countryCode: 'PT',
    countryName: 'Portugal',
    extraSearch: 'lisbon lis humberto delgado',
  }),
  testAirport({
    code: 'LIS',
    cityCode: 'LIS',
    name: 'Humberto Delgado',
    countryCode: 'PT',
    countryName: 'Portugal',
  }),
  // Cidade sem aeroporto comercial: existe no catálogo, mas não é pesquisável.
  testCity({ code: 'VSV', name: 'Vila Sem Voo', searchable: false }),
];
