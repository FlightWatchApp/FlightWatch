/**
 * SPEC-029 — regras puras do catálogo de lugares: normalização do texto de
 * busca, ordenação do autocomplete e frescor do catálogo. Sem I/O.
 */

/** Texto comparável: sem acento, minúsculo, espaços simples. */
export function normalizePlaceSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RankablePlace {
  code: string;
  name: string;
  airportCodes: readonly string[];
  /** Já normalizado (normalizePlaceSearchText). */
  searchText: string;
}

const MIN_QUERY_LENGTH = 2;

/**
 * Cada palavra digitada precisa ser o início de alguma palavra do texto.
 * Substring solta seria permissiva demais: "sao l" acharia "sao pau(l)o".
 */
function matchesAllWordPrefixes(words: readonly string[], searchText: string): boolean {
  const tokens = searchText.split(' ');
  return words.every((word) => tokens.some((token) => token.startsWith(word)));
}

/**
 * Ordem: código exato (da cidade ou de um aeroporto dela) → nome que começa
 * com o texto → todas as palavras no searchText. Empate: mais aeroportos,
 * depois nome.
 */
export function rankPlaceMatches<T extends RankablePlace>(
  query: string,
  places: readonly T[],
  limit = Number.POSITIVE_INFINITY,
): T[] {
  const term = normalizePlaceSearchText(query);
  if (term.length < MIN_QUERY_LENGTH) {
    return [];
  }
  const upperTerm = term.toUpperCase();
  const words = term.split(' ');

  const ranked: { place: T; rank: number; name: string }[] = [];
  for (const place of places) {
    const name = normalizePlaceSearchText(place.name);
    let rank: number;
    if (place.code === upperTerm || place.airportCodes.includes(upperTerm)) {
      rank = 0;
    } else if (name.startsWith(term)) {
      rank = 1;
    } else if (matchesAllWordPrefixes(words, place.searchText)) {
      // Todas as palavras, em qualquer ordem: "nova york" acha "nova iorque new york".
      rank = 2;
    } else {
      continue;
    }
    ranked.push({ place, rank, name });
  }

  // Desempate: mais aeroportos comerciais (indicador de cidade maior — o
  // catálogo não tem popularidade), depois nome. "orlando" → Flórida antes
  // da Noruega.
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.place.airportCodes.length - a.place.airportCodes.length ||
        a.name.localeCompare(b.name, 'pt'),
    )
    .slice(0, limit)
    .map((entry) => entry.place);
}

/** Catálogo é baixado de novo quando vazio ou com 7 dias ou mais. */
export const PLACES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldSyncPlaces(lastSyncedAt: Date | null, now: Date): boolean {
  return lastSyncedAt === null || now.getTime() - lastSyncedAt.getTime() >= PLACES_MAX_AGE_MS;
}

export type PlaceKind = 'CITY' | 'AIRPORT';

/** Registro de catálogo já validado, pronto para gravar (SPEC-029). */
export interface PlaceRecord {
  code: string;
  kind: PlaceKind;
  name: string;
  /** Para cidade, o próprio código. */
  cityCode: string;
  countryCode: string;
  countryName: string;
  timeZone: string | null;
  latitude: number | null;
  longitude: number | null;
  searchable: boolean;
  /** Já normalizado (normalizePlaceSearchText). */
  searchText: string;
}
