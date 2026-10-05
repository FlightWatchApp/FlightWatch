/**
 * SPEC-016: coordenadas fixas só para os 7 aeroportos já suportados
 * (mesma allowlist de `apps/api/src/watches/supported-catalog.ts` e do
 * `SUPPORTED_AIRPORTS` em `apps/web/src/app/watches/new/new-watch-form.tsx`
 * — terceira cópia da mesma lista fixa, documentada como provisória). Não é
 * um catálogo de `Destination` real (geodados licenciados/versionados) —
 * isso continua fora de escopo até uma decisão de produto/ADR
 * (`flight-watch-next-phases/04-domain-and-platform-evolution.md`).
 * Coordenadas são fatos públicos conhecidos (localização de aeroportos
 * grandes), não dado de terceiro licenciado.
 */
export interface AirportCoordinate {
  lat: number;
  lng: number;
  label: string;
  /** Só a cidade, sem o código — usada por `airportCity`/`airportLabel` (CP-03). */
  city: string;
}

export const AIRPORT_COORDINATES: Record<string, AirportCoordinate> = {
  DOU: { lat: -22.2011, lng: -54.9256, label: 'Dourados (DOU)', city: 'Dourados' },
  GRU: {
    lat: -23.4356,
    lng: -46.4731,
    label: 'São Paulo/Guarulhos (GRU)',
    city: 'São Paulo/Guarulhos',
  },
  GIG: {
    lat: -22.8099,
    lng: -43.2505,
    label: 'Rio de Janeiro/Galeão (GIG)',
    city: 'Rio de Janeiro/Galeão',
  },
  CGH: {
    lat: -23.6261,
    lng: -46.6564,
    label: 'São Paulo/Congonhas (CGH)',
    city: 'São Paulo/Congonhas',
  },
  BSB: { lat: -15.8697, lng: -47.9208, label: 'Brasília (BSB)', city: 'Brasília' },
  JFK: { lat: 40.6413, lng: -73.7781, label: 'Nova York/JFK (JFK)', city: 'Nova York/JFK' },
  MIA: { lat: 25.7959, lng: -80.287, label: 'Miami (MIA)', city: 'Miami' },
};

/** CP-03: só a cidade (sem o código). Código desconhecido devolve `null`. */
export function airportCity(iataCode: string): string | null {
  return AIRPORT_COORDINATES[iataCode]?.city ?? null;
}

/** CP-03: "GRU · São Paulo/Guarulhos". Código desconhecido devolve o próprio código. */
export function airportLabel(iataCode: string): string {
  const city = airportCity(iataCode);
  return city ? `${iataCode} · ${city}` : iataCode;
}
