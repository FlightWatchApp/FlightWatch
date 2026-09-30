import { z } from 'zod';

export const iataCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'must be a 3-letter IATA code')
  .transform((value) => value.toUpperCase());

/**
 * Regressão (SPEC-001): o regex sozinho só checa o formato dos dígitos, não
 * que a data exista de verdade. "2026-02-30" batia no regex e, ao virar
 * `Date`, o JS fazia rollover silencioso pra "2026-03-02" em vez de rejeitar
 * — o sistema aceitava e processava uma data completamente diferente da que
 * o usuário pediu, sem erro nenhum. Reconstrói a data a partir das partes e
 * confere que bate exatamente com o que foi informado (ano/mês/dia), pegando
 * também mês 13/0 e dia 32/0, que `new Date(...)` também aceita sem reclamar.
 */
function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine(isValidCalendarDate, 'must be a valid calendar date');

export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'must be a 3-letter currency code')
  .transform((value) => value.toUpperCase());

export const marketCodeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase());
