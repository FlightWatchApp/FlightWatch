import { formatMoney } from './money';

/**
 * SPEC-031 — grade do calendário de preços. Datas são tratadas como texto
 * AAAA-MM-DD e calculadas em UTC: data de viagem não passa por fuso
 * (CLAUDE.md §8.2).
 */

export interface CalendarDayInput {
  date: string;
  amountMinor: number;
  stops: number;
  observedAt: string;
}

export interface CalendarCell {
  date: string;
  day: number;
  amountMinor: number | null;
  stops: number | null;
  cheapest: boolean;
  selected: boolean;
  /** Rótulo completo para leitor de tela. */
  label: string;
}

export interface CalendarGrid {
  /** "novembro de 2026" */
  title: string;
  /** Semanas de domingo a sábado; `null` fora do mês. */
  weeks: (CalendarCell | null)[][];
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function buildCalendarGrid(
  month: string,
  days: readonly CalendarDayInput[],
  selectedDate: string | null,
  currency: string,
): CalendarGrid {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const monthName = MONTHS[monthNumber - 1] ?? month;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();

  const byDate = new Map(days.map((day) => [day.date, day]));
  const prices = days.map((day) => day.amountMinor);
  const cheapest = prices.length > 0 ? Math.min(...prices) : null;

  const cells: (CalendarCell | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const entry = byDate.get(date);
    const isCheapest = entry !== undefined && entry.amountMinor === cheapest;
    const isSelected = date === selectedDate;
    const price = entry
      ? formatMoney({ amountMinor: entry.amountMinor, currency }).replace(/\u00a0/g, ' ')
      : null;
    const highlight = isSelected ? ', data escolhida' : isCheapest ? ', menor preço do mês' : '';
    cells.push({
      date,
      day,
      amountMinor: entry?.amountMinor ?? null,
      stops: entry?.stops ?? null,
      cheapest: isCheapest,
      selected: isSelected,
      label: `${day} de ${monthName}, ${price ?? 'sem preço encontrado'}${highlight}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (CalendarCell | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return { title: `${monthName} de ${year}`, weeks };
}

/** Nova data de volta mantendo a duração da viagem; só ida continua null. */
export function shiftReturnDate(
  departureDate: string,
  returnDate: string | null,
  newDepartureDate: string,
): string | null {
  if (!returnDate) return null;
  return isoDate(utc(newDepartureDate) + (utc(returnDate) - utc(departureDate)));
}

/** Duração da viagem em dias (ida e volta), para o calendário comparar viagens equivalentes. */
export function tripLengthDays(departureDate: string, returnDate: string | null): number | null {
  return returnDate ? Math.round((utc(returnDate) - utc(departureDate)) / MS_PER_DAY) : null;
}
