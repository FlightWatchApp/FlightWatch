import { z } from 'zod';
import { type AirlineRecord, isAirlineCode } from '@flight-watch/domain';
import { ProviderError } from '../errors.js';
import { TRAVELPAYOUTS_DATA_BASE_URL } from './places-source.js';

const airlineSchema = z.object({
  code: z.string().nullish(),
  name: z.string().nullish(),
  name_translations: z.object({ en: z.string().nullish() }).partial().nullish(),
});

export interface ParsedAirlines {
  airlines: AirlineRecord[];
  invalid: number;
}

/**
 * SPEC-038: arquivo público de companhias da Travelpayouts. O nome em
 * português falta para a maioria (sondagem de 2026-10-14: 910 de 1159), então
 * vale o inglês quando não houver. Código fora do IATA de 2 caracteres ou sem
 * nome é descartado e contado.
 */
export function parseTravelpayoutsAirlines(raw: unknown): ParsedAirlines {
  if (!Array.isArray(raw)) {
    throw new ProviderError('MALFORMED_RESPONSE', 'airlines source: body is not a list');
  }
  const byCode = new Map<string, AirlineRecord>();
  let invalid = 0;
  for (const entry of raw) {
    const parsed = airlineSchema.safeParse(entry);
    const code = parsed.success ? parsed.data.code?.trim().toUpperCase() : undefined;
    const name = parsed.success
      ? (parsed.data.name ?? parsed.data.name_translations?.en ?? '').trim()
      : '';
    if (!code || !isAirlineCode(code) || !name) {
      invalid += 1;
      continue;
    }
    byCode.set(code, { code, name });
  }
  return { airlines: [...byCode.values()], invalid };
}

/** Baixa e valida o arquivo; erro de rede/HTTP vira ProviderError (o catálogo anterior fica). */
export async function fetchTravelpayoutsAirlines(options: {
  timeoutMs: number;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}): Promise<ParsedAirlines> {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? TRAVELPAYOUTS_DATA_BASE_URL;
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}/airlines.json`, {
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new ProviderError(
      timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
      'airlines source: request failed',
    );
  }
  if (!response.ok) {
    throw new ProviderError('UNAVAILABLE', `airlines source: returned ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProviderError('MALFORMED_RESPONSE', 'airlines source: body is not JSON');
  }
  return parseTravelpayoutsAirlines(body);
}
