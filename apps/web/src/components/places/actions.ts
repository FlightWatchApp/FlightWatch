'use server';

import { searchPlaces } from '@/lib/api/places';
import type { Place } from '@/lib/api/types';

/**
 * SPEC-029: chamada pelo PlaceCombobox no navegador (o navegador nunca fala
 * direto com a API — ADR-006). Falha vira lista vazia com `failed: true`, para
 * o campo dizer "não foi possível buscar" em vez de "nenhuma cidade".
 */
export async function searchPlacesAction(
  query: string,
): Promise<{ places: Place[]; failed: boolean }> {
  try {
    return { places: await searchPlaces(query), failed: false };
  } catch {
    return { places: [], failed: true };
  }
}
