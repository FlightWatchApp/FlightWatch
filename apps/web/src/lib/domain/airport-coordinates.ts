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
}

export const AIRPORT_COORDINATES: Record<string, AirportCoordinate> = {
  DOU: { lat: -22.2011, lng: -54.9256, label: 'Dourados (DOU)' },
  GRU: { lat: -23.4356, lng: -46.4731, label: 'São Paulo/Guarulhos (GRU)' },
  GIG: { lat: -22.8099, lng: -43.2505, label: 'Rio de Janeiro/Galeão (GIG)' },
  CGH: { lat: -23.6261, lng: -46.6564, label: 'São Paulo/Congonhas (CGH)' },
  BSB: { lat: -15.8697, lng: -47.9208, label: 'Brasília (BSB)' },
  JFK: { lat: 40.6413, lng: -73.7781, label: 'Nova York/JFK (JFK)' },
  MIA: { lat: 25.7959, lng: -80.287, label: 'Miami (MIA)' },
};
