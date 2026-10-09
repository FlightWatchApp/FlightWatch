/**
 * SPEC-033 §URL: `/voos/{slug}-{código}-para-{slug}-{código}`. O código da
 * cidade decide; o slug é só legibilidade. Funções puras: a página resolve
 * os códigos no catálogo e redireciona (308) para a URL canônica quando o
 * caminho pedido for diferente dela.
 */

export interface RoutePlaceRef {
  code: string;
  name: string;
}

export interface ParsedRouteSegment {
  originCode: string;
  destinationCode: string;
  /** null quando a URL veio só com os códigos (`gru-para-dou`). */
  originSlug: string | null;
  destinationSlug: string | null;
}

/** "Belém do Pará" → "belem-do-para". */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function side(place: RoutePlaceRef): string {
  const slug = slugify(place.name);
  const code = place.code.toLowerCase();
  return slug ? `${slug}-${code}` : code;
}

export function routeSegment(origin: RoutePlaceRef, destination: RoutePlaceRef): string {
  return `${side(origin)}-para-${side(destination)}`;
}

export function routePath(origin: RoutePlaceRef, destination: RoutePlaceRef): string {
  return `/voos/${routeSegment(origin, destination)}`;
}

// O código de 3 letras colado ao "-para-" é a âncora: "belem-do-para-bel-para-…"
// lê a origem até "bel", porque o nome é preguiçoso e o código exige 3 letras.
const SEGMENT = /^(?:(.*?)-)?([a-z]{3})-para-(?:(.*)-)?([a-z]{3})$/;

export function parseRouteSegment(segment: string): ParsedRouteSegment | null {
  const match = SEGMENT.exec(segment.toLowerCase());
  if (!match) return null;
  const [, originSlug, originCode, destinationSlug, destinationCode] = match;
  if (!originCode || !destinationCode) return null;
  return {
    originCode: originCode.toUpperCase(),
    destinationCode: destinationCode.toUpperCase(),
    originSlug: originSlug || null,
    destinationSlug: destinationSlug || null,
  };
}
