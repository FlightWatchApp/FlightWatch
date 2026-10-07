'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { searchFlightsAction } from '@/app/search/actions';
import { InlineAlert } from '@/components/ui/inline-alert';
import type { FlightSearchResult } from '@/lib/api/types';
import { formatMoney } from '@/lib/domain/money';
import {
  type CalendarDayInput,
  buildCalendarGrid,
  shiftReturnDate,
} from '@/lib/domain/price-calendar';
import styles from './price-calendar.module.css';

const WEEKDAYS = [
  ['D', 'domingo'],
  ['S', 'segunda'],
  ['T', 'terça'],
  ['Q', 'quarta'],
  ['Q', 'quinta'],
  ['S', 'sexta'],
  ['S', 'sábado'],
] as const;

export interface PriceCalendarProps {
  search: FlightSearchResult;
  month: string;
  days: CalendarDayInput[];
}

/**
 * SPEC-031 AC-4: menor preço encontrado em cada dia do mês. Clicar num dia
 * busca aquela data (ida e volta mantém a duração da viagem).
 */
export function PriceCalendar({ search, month, days }: PriceCalendarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const grid = buildCalendarGrid(month, days, search.departureDate, search.currency);

  function searchDate(date: string): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await searchFlightsAction({
          origin: search.origin,
          destination: search.destination,
          tripType: search.tripType,
          departureDate: date,
          returnDate: shiftReturnDate(search.departureDate, search.returnDate, date),
          currency: search.currency,
          market: search.market,
          maxStops: null,
          maxPriceMinor: null,
        });
        if (result.success && result.id) {
          router.push(`/search?searchId=${result.id}#search-results`);
        } else {
          setError(result.error ?? 'Não foi possível buscar essa data.');
        }
      })();
    });
  }

  return (
    <div className={styles.calendar} aria-busy={isPending}>
      <table className={styles.table}>
        <caption className={styles.caption}>
          Menor preço encontrado por dia em {grid.title}
          {search.tripType === 'ROUND_TRIP' ? ', mesma duração de viagem' : ''}
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, full]) => (
              <th key={full} scope="col" abbr={full}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((cell, dayIndex) =>
                cell ? (
                  <td key={cell.date}>
                    <button
                      type="button"
                      className={[
                        styles.day,
                        cell.cheapest ? styles.cheapest : '',
                        cell.selected ? styles.selected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={cell.label}
                      aria-current={cell.selected ? 'date' : undefined}
                      disabled={isPending || cell.selected}
                      onClick={() => searchDate(cell.date)}
                    >
                      <span className={styles.number}>{cell.day}</span>
                      <span className={`${styles.price} tabular-nums`}>
                        {cell.amountMinor !== null
                          ? formatMoney({
                              amountMinor: cell.amountMinor,
                              currency: search.currency,
                            })
                          : '—'}
                      </span>
                    </button>
                  </td>
                ) : (
                  <td key={`empty-${weekIndex}-${dayIndex}`} aria-hidden="true" />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </div>
  );
}
