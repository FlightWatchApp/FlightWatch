const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * DS-07: todo instante (observação, verificação, horário de voo) é formatado
 * neste fuso fixo — nunca o fuso do processo. O provider devolve tudo em
 * UTC; o servidor Next roda em UTC (padrão de container) e o navegador da
 * pessoa usuária no fuso dela (em geral Brasil). Sem um fuso fixo, o mesmo
 * `Intl.DateTimeFormat` produz textos diferentes no SSR e na hidratação do
 * cliente — React acusa erro #418 (mismatch) assim que um componente
 * interativo (ex.: `Freshness`, CP-04) precisa recalcular no cliente.
 */
export const DISPLAY_TIME_ZONE = 'America/Sao_Paulo';

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

/**
 * "2 horas" / "45 minutos" — magnitude pura, sempre numérica (CP-04,
 * "válido por mais 2 horas"). Diferente de `formatRelativeTime`
 * (`numeric: 'auto'`), que pode virar "amanhã" perto de um limite de dia —
 * aceitável para "última verificação", mas não para uma janela de validade
 * curta, onde "válido por mais amanhã" não faz sentido.
 */
export function formatRemainingDuration(iso: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, new Date(iso).getTime() - now.getTime());
  if (diffMs < HOUR) {
    const minutes = Math.max(1, Math.round(diffMs / MINUTE));
    return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diffMs < DAY) {
    const hours = Math.round(diffMs / HOUR);
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  const days = Math.round(diffMs / DAY);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/**
 * CP-16: horário de partida/chegada de voo, sempre em `DISPLAY_TIME_ZONE`
 * (hoje igual ao horário de Brasília, P-05) — rotulado na tela como tal
 * enquanto essa decisão de produto não for revista por rota/aeroporto.
 */
export function formatFlightTime(iso: string, locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatAbsoluteDateTime(iso: string, locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: DISPLAY_TIME_ZONE,
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

/** CP-04: `expiresAt` ausente nunca é "expirado" — é só uma oferta sem validade informada. */
export function isOfferExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}
