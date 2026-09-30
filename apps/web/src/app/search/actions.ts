'use server';

import { ApiError } from '@/lib/api/client';
import { type SearchFlightsInput, searchFlights } from '@/lib/api/searches';

export interface SearchFlightsActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_SEARCH: 'Essa rota, moeda ou mercado ainda não é suportado nesta versão.',
  INVALID_SEARCH_INPUT: 'Alguns dados não são válidos — confira rota e datas.',
  RATE_LIMITED: 'Muitas buscas em pouco tempo. Espere um instante e tente de novo.',
};

export async function searchFlightsAction(
  input: SearchFlightsInput,
): Promise<SearchFlightsActionResult> {
  try {
    const result = await searchFlights(input);
    return { success: true, id: result.id };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível buscar. Tente novamente.',
      };
    }
    return { success: false, error: 'Não foi possível buscar. Tente novamente.' };
  }
}
