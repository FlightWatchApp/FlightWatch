import { z } from 'zod';

/**
 * Validadores de uma variável de ambiente. Toda mensagem de erro é escrita
 * aqui e descreve o formato esperado — nunca ecoa o valor recebido, que pode
 * ser segredo (SPEC-024 AC-6). Por isso não usamos as mensagens padrão do Zod,
 * que incluem o valor em alguns códigos (ex.: enum inválido).
 */

const REQUIRED = 'obrigatória';

function required<T>(ctx: z.RefinementCtx, fallback: T | undefined): T {
  if (fallback !== undefined) {
    return fallback;
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: REQUIRED });
  return z.NEVER;
}

export function intField(options: { min: number; max: number; default?: number | undefined }) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) {
        return required(ctx, options.default);
      }
      const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
      if (!Number.isSafeInteger(value) || value < options.min || value > options.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `deve ser um inteiro entre ${options.min} e ${options.max}`,
        });
        return z.NEVER;
      }
      return value;
    });
}

export function portField(defaultPort?: number) {
  return intField({ min: 1, max: 65_535, default: defaultPort });
}

/** Duração em milissegundos, de 1 ms a 24 h. */
export function durationMsField(defaultMs: number) {
  return intField({ min: 1, max: 24 * 60 * 60 * 1000, default: defaultMs });
}

export function urlField(protocols: readonly string[]) {
  const expected = protocols.map((protocol) => `${protocol}//`).join(' ou ');
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) {
        return required<string>(ctx, undefined);
      }
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        parsed = new URL('invalid:');
      }
      if (!protocols.includes(parsed.protocol)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `deve ser uma URL ${expected}` });
        return z.NEVER;
      }
      return raw;
    });
}

export function enumField<const T extends readonly [string, ...string[]]>(
  values: T,
  defaultValue?: T[number],
) {
  return z
    .string()
    .optional()
    .transform((raw, ctx): T[number] => {
      if (raw === undefined) {
        return required(ctx, defaultValue);
      }
      if (!values.includes(raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `deve ser um de: ${values.join(', ')}`,
        });
        return z.NEVER;
      }
      return raw;
    });
}

/** Host de bind: IPv4, IPv6 sem colchetes ou nome DNS. */
export function hostField(defaultHost: string) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) {
        return defaultHost;
      }
      if (!/^[A-Za-z0-9.:-]{1,253}$/.test(raw)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'deve ser um host ou IP' });
        return z.NEVER;
      }
      return raw;
    });
}
