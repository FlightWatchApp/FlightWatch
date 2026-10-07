import { z } from 'zod';
import { type PlaceRecord, normalizePlaceSearchText } from '@flight-watch/domain';
import { ProviderError } from '../errors.js';

/**
 * SPEC-029 — catálogo de cidades e aeroportos da Travelpayouts
 * (`data/pt/{countries,cities,airports}.json`, públicos, sem token).
 * Valida cada registro na fronteira: registro inválido é descartado e
 * contado, nunca derruba a sincronização inteira.
 */

export const TRAVELPAYOUTS_DATA_BASE_URL = 'https://api.travelpayouts.com/data/pt';

const iataCode = z.string().regex(/^[A-Z]{3}$/);
const countryCode = z.string().regex(/^[A-Z]{2}$/);
const optionalName = z.string().trim().min(1).max(120).nullish();
const translations = z.object({ en: optionalName }).partial().nullish();
const coordinates = z
  .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
  .nullish();
const timeZone = z.string().max(64).nullish();

const countrySchema = z.object({
  code: countryCode,
  name: optionalName,
  name_translations: translations,
});

const citySchema = z.object({
  code: iataCode,
  name: optionalName,
  name_translations: translations,
  country_code: countryCode,
  time_zone: timeZone,
  coordinates,
  has_flightable_airport: z.boolean().nullish(),
});

const airportSchema = z.object({
  code: iataCode,
  name: optionalName,
  name_translations: translations,
  city_code: iataCode,
  country_code: countryCode,
  time_zone: timeZone,
  coordinates,
  iata_type: z.string().nullish(),
  flightable: z.boolean().nullish(),
});

type City = z.infer<typeof citySchema>;
type Airport = z.infer<typeof airportSchema>;

export interface RawTravelpayoutsPlaces {
  countries: unknown;
  cities: unknown;
  airports: unknown;
}

export interface ParsedPlaces {
  places: PlaceRecord[];
  invalid: { cities: number; airports: number };
  ignored: { nonAirportTypes: number };
}

function asList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderError('MALFORMED_RESPONSE', `places source: ${label} is not a lista`);
  }
  return value;
}

function bestName(record: {
  name?: string | null | undefined;
  name_translations?: { en?: string | null | undefined } | null | undefined;
}): string | null {
  return record.name ?? record.name_translations?.en ?? null;
}

export function parseTravelpayoutsPlaces(raw: RawTravelpayoutsPlaces): ParsedPlaces {
  const countryNames = new Map<string, string>();
  for (const entry of asList(raw.countries, 'countries')) {
    const parsed = countrySchema.safeParse(entry);
    const name = parsed.success ? bestName(parsed.data) : null;
    if (parsed.success && name) {
      countryNames.set(parsed.data.code, name);
    }
  }

  const invalid = { cities: 0, airports: 0 };
  const ignored = { nonAirportTypes: 0 };

  const airports: (Airport & { displayName: string })[] = [];
  for (const entry of asList(raw.airports, 'airports')) {
    const parsed = airportSchema.safeParse(entry);
    if (!parsed.success) {
      invalid.airports += 1;
      continue;
    }
    // Só aeroportos: estações de trem/ônibus, portos e helipontos ficam fora.
    if (parsed.data.iata_type !== 'airport') {
      ignored.nonAirportTypes += 1;
      continue;
    }
    const displayName = bestName(parsed.data);
    if (!displayName) {
      invalid.airports += 1;
      continue;
    }
    airports.push({ ...parsed.data, displayName });
  }

  const commercialAirportsByCity = new Map<string, (Airport & { displayName: string })[]>();
  for (const airport of airports) {
    if (airport.flightable) {
      const list = commercialAirportsByCity.get(airport.city_code) ?? [];
      list.push(airport);
      commercialAirportsByCity.set(airport.city_code, list);
    }
  }

  const places: PlaceRecord[] = [];
  for (const entry of asList(raw.cities, 'cities')) {
    const parsed = citySchema.safeParse(entry);
    const name = parsed.success ? bestName(parsed.data) : null;
    if (!parsed.success || !name) {
      invalid.cities += 1;
      continue;
    }
    const city: City = parsed.data;
    const countryName = countryNames.get(city.country_code) ?? city.country_code;
    const cityAirports = commercialAirportsByCity.get(city.code) ?? [];
    places.push({
      code: city.code,
      kind: 'CITY',
      name,
      cityCode: city.code,
      countryCode: city.country_code,
      countryName,
      timeZone: city.time_zone ?? null,
      latitude: city.coordinates?.lat ?? null,
      longitude: city.coordinates?.lon ?? null,
      searchable: city.has_flightable_airport === true,
      searchText: normalizePlaceSearchText(
        [
          name,
          city.name_translations?.en,
          countryName,
          city.code,
          ...cityAirports.flatMap((airport) => [airport.code, airport.displayName]),
        ]
          .filter(Boolean)
          .join(' '),
      ),
    });
  }

  for (const airport of airports) {
    const countryName = countryNames.get(airport.country_code) ?? airport.country_code;
    places.push({
      code: airport.code,
      kind: 'AIRPORT',
      name: airport.displayName,
      cityCode: airport.city_code,
      countryCode: airport.country_code,
      countryName,
      timeZone: airport.time_zone ?? null,
      latitude: airport.coordinates?.lat ?? null,
      longitude: airport.coordinates?.lon ?? null,
      searchable: airport.flightable === true,
      searchText: normalizePlaceSearchText(
        [airport.displayName, airport.name_translations?.en, airport.code]
          .filter(Boolean)
          .join(' '),
      ),
    });
  }

  return { places, invalid, ignored };
}

/**
 * Baixa os três arquivos com timeout e valida. Erros de rede/HTTP viram
 * ProviderError (UNAVAILABLE/TIMEOUT/MALFORMED_RESPONSE) — o chamador mantém
 * o catálogo anterior.
 */
export async function fetchTravelpayoutsPlaces(options: {
  timeoutMs: number;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}): Promise<ParsedPlaces> {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? TRAVELPAYOUTS_DATA_BASE_URL;

  async function getJson(file: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}/${file}.json`, {
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new ProviderError(
        timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
        `places source: ${file} request failed`,
      );
    }
    if (!response.ok) {
      throw new ProviderError('UNAVAILABLE', `places source: ${file} returned ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderError('MALFORMED_RESPONSE', `places source: ${file} is not JSON`);
    }
  }

  const [countries, cities, airports] = await Promise.all([
    getJson('countries'),
    getJson('cities'),
    getJson('airports'),
  ]);
  return parseTravelpayoutsPlaces({ countries, cities, airports });
}
