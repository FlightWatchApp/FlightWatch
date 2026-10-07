/** "785" → "13h05"; `null` quando a duração não é conhecida (resumo de tarifa). */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, '0')}`;
}

export function formatStops(stops: number): string {
  if (stops === 0) return 'Direto';
  return `${stops} ${stops === 1 ? 'conexão' : 'conexões'}`;
}

/** "2026-11-17" → "17/11", direto do texto: data de viagem não passa por fuso (CLAUDE.md §8.2). */
function dayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/**
 * SPEC-030: o que uma oferta de cache de preços é — o menor preço encontrado
 * para o dia (sem horário nem companhia, que a fonte não informa).
 */
export function fareSummaryHeadline(summary: {
  departureDate: string;
  returnDate: string | null;
}): string {
  const back = summary.returnDate ? `, volta ${dayMonth(summary.returnDate)}` : '';
  return `Menor preço encontrado para ${dayMonth(summary.departureDate)}${back}`;
}
