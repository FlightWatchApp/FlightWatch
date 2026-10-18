/**
 * SPEC-043: a cota mensal de monitoramentos segue o mês do calendário em
 * America/Campo_Grande (CLAUDE.md §8.2). As bordas são instantes UTC.
 */
export const QUOTA_TIME_ZONE = 'America/Campo_Grande';

export interface MonthWindow {
  /** Primeiro instante do mês corrente (00:00 local). */
  start: Date;
  /** Primeiro instante do mês seguinte (00:00 local): quando a cota volta. */
  resetsAt: Date;
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: QUOTA_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function localParts(instant: Date): { year: number; month: number } {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year as number, month: parts.month as number };
}

/** Deslocamento (ms) do fuso em relação ao UTC naquele instante. */
function offsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.year as number,
    (parts.month as number) - 1,
    parts.day as number,
    parts.hour as number,
    parts.minute as number,
    parts.second as number,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante UTC da meia-noite local do dia 1 do mês (`month` de 1 a 12). */
function localMonthStart(year: number, month: number): Date {
  const naive = Date.UTC(year, month - 1, 1);
  const first = naive - offsetMs(new Date(naive));
  // Reconfere o deslocamento no instante achado (cobre fusos com horário de verão).
  return new Date(naive - offsetMs(new Date(first)));
}

export function monthWindow(now: Date): MonthWindow {
  const { year, month } = localParts(now);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: localMonthStart(year, month),
    resetsAt: localMonthStart(nextYear, nextMonth),
  };
}
