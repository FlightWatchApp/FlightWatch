/** SPEC-032: preferência de origem do feed de promoções (não identifica ninguém). */
export const ORIGIN_COOKIE_NAME = 'fw_origin';

/** Código de cidade de 3 letras em maiúsculas; qualquer outra coisa vira null. */
export function normalizeOriginCode(value: string | undefined | null): string | null {
  const code = value?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(code) ? code : null;
}
