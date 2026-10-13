import { slugify } from './route-url';

/**
 * SPEC-034: cidade aproximada do visitante pelos cabeçalhos que a Cloudflare
 * acrescenta ("visitor location headers"). Só para sugerir de onde a pessoa
 * sai — nada é gravado. Sem Cloudflare, ou fora do Brasil, não há sugestão.
 */
export function visitorCityFromHeaders(get: (name: string) => string | null): string | null {
  if (get('cf-ipcountry')?.trim().toUpperCase() !== 'BR') return null;
  const raw = get('cf-ipcity')?.trim();
  if (!raw) return null;
  let city = raw;
  try {
    city = decodeURIComponent(raw).trim();
  } catch {
    // Valor não codificado (ou malformado): usa como veio.
  }
  return city.length >= 2 && city.length <= 80 ? city : null;
}

/** O nome do catálogo corresponde à cidade do cabeçalho (sem acento, sem caixa). */
export function matchesVisitorCity(catalogName: string, visitorCity: string): boolean {
  return slugify(catalogName) === slugify(visitorCity);
}
