const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "há 3 minutos" / "há 2 dias" — sempre relativo a `now`, nunca hardcoded. */
export function formatRelativeTime(iso: string, now: Date = new Date(), locale = 'pt-BR'): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const abs = Math.abs(diffMs);
  if (abs < MINUTE) return rtf.format(Math.round(diffMs / 1000), 'seconds');
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MINUTE), 'minutes');
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), 'hours');
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), 'days');
  if (abs < 365 * DAY) return rtf.format(Math.round(diffMs / (30 * DAY)), 'months');
  return rtf.format(Math.round(diffMs / (365 * DAY)), 'years');
}

export function formatAbsoluteDateTime(iso: string, locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * Datas de viagem (`departureDate`/`returnDate`) são calendário puro, sem
 * componente de hora. `new Date('2027-01-01')` é interpretado como meia-noite
 * UTC (regra do ISO 8601 para strings só-de-data) — formatar isso no fuso local
 * sem fixar `timeZone: 'UTC'` desloca a data em um dia para qualquer fuso
 * negativo (Campo Grande é UTC-4: meia-noite UTC vira 20h do dia anterior).
 */
export function formatDate(isoDate: string, locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(isoDate),
  );
}

/**
 * Heurística só de apresentação — o produto não define um SLA fixo de frescor
 * (ARCHITECTURE.md §8: intervalo é adaptativo). 48h sem consulta bem-sucedida é
 * usado aqui apenas para sinalizar "dado desatualizado" na UI, não uma regra de
 * domínio. Ajustar quando o produto definir um SLO por classe.
 */
const STALE_AFTER_MS = 48 * HOUR;

export function isStale(lastSuccessfulCheckIso: string | null, now: Date = new Date()): boolean {
  if (!lastSuccessfulCheckIso) return true;
  return now.getTime() - new Date(lastSuccessfulCheckIso).getTime() > STALE_AFTER_MS;
}
