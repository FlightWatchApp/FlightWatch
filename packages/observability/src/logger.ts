/**
 * ADR-007: JSON de uma linha por evento via `console.log`, sem lib de logging
 * — não há coletor central ainda que justifique pino/winston. Sempre inclui
 * `correlationId` quando disponível (ARCHITECTURE.md §12, AGENTS.md §9).
 */
export interface LogFields {
  event: string;
  correlationId?: string;
  [key: string]: unknown;
}

const REDACTED = '[redacted]';

// AGENTS.md §4: "Nenhum log contém token, payload sensível ou contato
// completo". A comparação é case-insensitive e ignora separadores para cobrir
// passwordHash/password_hash/PASSWORD-HASH e variações equivalentes.
const FORBIDDEN_FIELDS = new Set([
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'setcookie',
  'email',
  'emailaddress',
  'destination',
  'phone',
  'phonenumber',
  'secret',
  'apikey',
  'privatekey',
]);

function isForbiddenField(key: string): boolean {
  return FORBIDDEN_FIELDS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase());
}

function redactText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
    .replace(/\bBearer\s+[^\s]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /((?:password|token|secret|api[_-]?key|authorization|cookie|destination|email)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      `$1${REDACTED}`,
    );
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: redactText(value.name),
      message: redactText(value.message),
      ...(value.stack ? { stack: redactText(value.stack) } : {}),
      ...(value.cause !== undefined ? { cause: sanitizeValue(value.cause, seen) } : {}),
    };
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = isForbiddenField(key) ? REDACTED : sanitizeValue(item, seen);
  }
  return result;
}

export function logEvent(fields: LogFields): void {
  const sanitized = sanitizeValue(fields, new WeakSet()) as Record<string, unknown>;
  if (typeof sanitized.event !== 'string' || sanitized.event.length === 0) {
    sanitized.event = 'unknown';
  }
  // O timestamp é do logger, não do chamador; isso evita logs fora de ordem
  // lógica por sobrescrita acidental do campo reservado.
  sanitized.timestamp = new Date().toISOString();
  console.log(JSON.stringify(sanitized));
}
