import { type PlaceRecord, normalizePlaceSearchText, rankPlaceMatches } from '@flight-watch/domain';
import type { PrismaClient } from './client.js';

/**
 * SPEC-029 — catálogo de cidades e aeroportos. A fonte (Travelpayouts) é
 * lida em packages/providers; aqui só persistência e consultas.
 */

const UPSERT_BATCH_SIZE = 2000;
const SYNC_TRANSACTION_TIMEOUT_MS = 120_000;
const CANDIDATE_LIMIT = 200;

/**
 * Coordenada vai como texto e vira double precision no SQL. Array de number
 * tem o tipo deduzido pelos valores (só inteiros vs. decimais), e o Postgres
 * reaproveita o statement preparado na mesma conexão: tipos alternados
 * quebravam com 22P03 "improper binary format in array element".
 */
function coordinateParam(value: number | null): string | null {
  return value === null ? null : String(value);
}

export interface PlacesSyncResult {
  upserted: number;
  disabled: number;
}

/**
 * Grava o catálogo inteiro numa transação: falha no meio mantém o catálogo
 * anterior. Lugar ausente da fonte vira `searchable=false` (não é apagado —
 * monitoramentos antigos continuam exibindo o nome).
 */
export async function syncPlacesCatalog(
  prisma: PrismaClient,
  records: readonly PlaceRecord[],
  syncedAt: Date,
): Promise<PlacesSyncResult> {
  // Chave repetida no mesmo INSERT faz o ON CONFLICT falhar; a última vence.
  const unique = [
    ...new Map(records.map((record) => [`${record.kind}:${record.code}`, record])).values(),
  ];

  return prisma.$transaction(
    async (tx) => {
      for (let start = 0; start < unique.length; start += UPSERT_BATCH_SIZE) {
        const batch = unique.slice(start, start + UPSERT_BATCH_SIZE);
        await tx.$executeRaw`
          INSERT INTO "places" ("code", "kind", "name", "cityCode", "countryCode", "countryName",
            "timeZone", "latitude", "longitude", "searchable", "searchText", "syncedAt")
          SELECT u.code, u.kind::"PlaceKind", u.name, u.city_code, u.country_code, u.country_name,
            u.time_zone, u.latitude, u.longitude, u.searchable, u.search_text, ${syncedAt}
          FROM unnest(
            ${batch.map((r) => r.code)}::text[],
            ${batch.map((r) => r.kind)}::text[],
            ${batch.map((r) => r.name)}::text[],
            ${batch.map((r) => r.cityCode)}::text[],
            ${batch.map((r) => r.countryCode)}::text[],
            ${batch.map((r) => r.countryName)}::text[],
            ${batch.map((r) => r.timeZone)}::text[],
            ${batch.map((r) => coordinateParam(r.latitude))}::text[]::double precision[],
            ${batch.map((r) => coordinateParam(r.longitude))}::text[]::double precision[],
            ${batch.map((r) => r.searchable)}::boolean[],
            ${batch.map((r) => r.searchText)}::text[]
          ) AS u(code, kind, name, city_code, country_code, country_name, time_zone,
            latitude, longitude, searchable, search_text)
          ON CONFLICT ("code", "kind") DO UPDATE SET
            "name" = EXCLUDED."name",
            "cityCode" = EXCLUDED."cityCode",
            "countryCode" = EXCLUDED."countryCode",
            "countryName" = EXCLUDED."countryName",
            "timeZone" = EXCLUDED."timeZone",
            "latitude" = EXCLUDED."latitude",
            "longitude" = EXCLUDED."longitude",
            "searchable" = EXCLUDED."searchable",
            "searchText" = EXCLUDED."searchText",
            "syncedAt" = EXCLUDED."syncedAt"`;
      }

      const disabled = await tx.place.updateMany({
        where: { syncedAt: { lt: syncedAt }, searchable: true },
        data: { searchable: false },
      });
      return { upserted: unique.length, disabled: disabled.count };
    },
    { timeout: SYNC_TRANSACTION_TIMEOUT_MS },
  );
}

export async function getPlacesLastSyncedAt(prisma: PrismaClient): Promise<Date | null> {
  const result = await prisma.place.aggregate({ _max: { syncedAt: true } });
  return result._max.syncedAt;
}

export interface CitySearchResult {
  code: string;
  name: string;
  countryCode: string;
  countryName: string;
  airports: { code: string; name: string }[];
}

/** Palavras só com letras/números: `%`/`_` digitados não viram coringa no LIKE. */
function searchWords(term: string): string[] {
  return term
    .split(' ')
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0)
    .slice(0, 6);
}

/** SPEC-029: autocomplete de cidades pesquisáveis, ordenado no domínio. */
export async function searchCities(
  prisma: PrismaClient,
  query: string,
  limit: number,
): Promise<CitySearchResult[]> {
  const term = normalizePlaceSearchText(query);
  const words = searchWords(term);
  if (term.length < 2 || words.length === 0) {
    return [];
  }
  const upper = term.toUpperCase();

  // Correspondência por código (da cidade ou de um aeroporto dela) entra
  // sempre, mesmo se a busca por texto tiver mais candidatos que o limite.
  const exactCodes = new Set<string>();
  if (/^[A-Z]{3}$/.test(upper)) {
    exactCodes.add(upper);
    const airport = await prisma.place.findFirst({
      where: { kind: 'AIRPORT', code: upper, searchable: true },
      select: { cityCode: true },
    });
    if (airport) exactCodes.add(airport.cityCode);
  }

  const [byCode, byText] = await Promise.all([
    exactCodes.size > 0
      ? prisma.place.findMany({
          where: { kind: 'CITY', searchable: true, code: { in: [...exactCodes] } },
        })
      : Promise.resolve([]),
    prisma.place.findMany({
      where: {
        kind: 'CITY',
        searchable: true,
        AND: words.map((word) => ({ searchText: { contains: word } })),
      },
      orderBy: { name: 'asc' },
      take: CANDIDATE_LIMIT,
    }),
  ]);
  const candidates = [...new Map([...byCode, ...byText].map((city) => [city.code, city])).values()];
  if (candidates.length === 0) {
    return [];
  }

  const airports = await prisma.place.findMany({
    where: { kind: 'AIRPORT', searchable: true, cityCode: { in: candidates.map((c) => c.code) } },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, cityCode: true },
  });
  const airportsByCity = new Map<string, { code: string; name: string }[]>();
  for (const airport of airports) {
    const list = airportsByCity.get(airport.cityCode) ?? [];
    list.push({ code: airport.code, name: airport.name });
    airportsByCity.set(airport.cityCode, list);
  }

  const ranked = rankPlaceMatches(
    query,
    candidates.map((city) => ({
      ...city,
      airportCodes: (airportsByCity.get(city.code) ?? []).map((airport) => airport.code),
    })),
    limit,
  );
  return ranked.map((city) => ({
    code: city.code,
    name: city.name,
    countryCode: city.countryCode,
    countryName: city.countryName,
    airports: airportsByCity.get(city.code) ?? [],
  }));
}

/**
 * SPEC-029 "Lugar = cidade": cidade pesquisável continua ela mesma; aeroporto
 * pesquisável vira a cidade dele. Desconhecido ou sem voo comercial → null.
 */
export async function resolveSearchableCityCode(
  prisma: PrismaClient,
  code: string,
): Promise<string | null> {
  const city = await prisma.place.findUnique({
    where: { code_kind: { code, kind: 'CITY' } },
    select: { searchable: true },
  });
  if (city?.searchable) {
    return code;
  }
  const airport = await prisma.place.findUnique({
    where: { code_kind: { code, kind: 'AIRPORT' } },
    select: { searchable: true, cityCode: true },
  });
  if (!airport?.searchable) {
    return null;
  }
  const airportCity = await prisma.place.findUnique({
    where: { code_kind: { code: airport.cityCode, kind: 'CITY' } },
    select: { searchable: true },
  });
  return airportCity?.searchable ? airport.cityCode : null;
}

export interface PlaceSummary {
  name: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Nome e coordenadas para exibição, por código. Código de aeroporto (dado
 * anterior à SPEC-029) mostra a cidade dele. Desconhecido fica fora do mapa.
 */
export async function findPlaceSummaries(
  prisma: PrismaClient,
  codes: readonly string[],
): Promise<Map<string, PlaceSummary>> {
  const unique = [...new Set(codes)];
  const summaries = new Map<string, PlaceSummary>();
  if (unique.length === 0) {
    return summaries;
  }

  const direct = await prisma.place.findMany({ where: { code: { in: unique } } });
  const citiesByCode = new Map(
    direct.filter((place) => place.kind === 'CITY').map((city) => [city.code, city]),
  );
  const airportOnly = direct.filter(
    (place) => place.kind === 'AIRPORT' && !citiesByCode.has(place.code),
  );
  const parentCities = await prisma.place.findMany({
    where: { kind: 'CITY', code: { in: airportOnly.map((airport) => airport.cityCode) } },
  });
  const parentByCode = new Map(parentCities.map((city) => [city.code, city]));

  for (const [code, city] of citiesByCode) {
    summaries.set(code, { name: city.name, lat: city.latitude, lng: city.longitude });
  }
  for (const airport of airportOnly) {
    const parent = parentByCode.get(airport.cityCode);
    const source = parent ?? airport;
    summaries.set(airport.code, { name: source.name, lat: source.latitude, lng: source.longitude });
  }
  return summaries;
}
