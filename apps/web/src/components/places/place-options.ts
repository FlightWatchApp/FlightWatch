import type { Place } from '@/lib/api/types';

/** Cidade escolhida num campo de origem/destino (SPEC-029). */
export interface SelectedPlace {
  code: string;
  name: string;
}

/** Próximo item ativo do listbox, dando a volta nas pontas; -1 sem itens. */
export function moveActiveIndex(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}

/** Texto do campo depois de escolher: "São Paulo (SAO)". */
export function formatPlaceLabel(place: SelectedPlace): string {
  return `${place.name} (${place.code})`;
}

const MAX_AIRPORTS_SHOWN = 3;

/** Linha de apoio da opção: "Brasil · GRU, CGH, VCP +2". */
export function placeOptionDetail(place: Place): string {
  const codes = place.airports.map((airport) => airport.code);
  const shown = codes.slice(0, MAX_AIRPORTS_SHOWN).join(', ');
  const rest = codes.length - MAX_AIRPORTS_SHOWN;
  const airports = rest > 0 ? `${shown} +${rest}` : shown;
  return airports ? `${place.countryName} · ${airports}` : place.countryName;
}

/**
 * Texto do campo quando o valor muda por fora. `null` = manter o texto.
 * Regressão: limpar a escolha ao digitar apagava o que a pessoa digitava —
 * por digitação, o texto já não bate com o rótulo anterior e fica.
 */
export function textForValueChange(
  previous: SelectedPlace | null,
  next: SelectedPlace | null,
  currentText: string,
): string | null {
  if (next) return formatPlaceLabel(next);
  if (previous && currentText === formatPlaceLabel(previous)) return '';
  return null;
}
